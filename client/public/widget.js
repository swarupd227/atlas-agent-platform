(function() {
  'use strict';

  var script = document.currentScript;
  var channelToken = script.getAttribute('data-agent-channel') || '';
  var baseUrl = script.getAttribute('data-base-url') || script.src.replace(/\/widget\.js.*$/, '');
  var position = script.getAttribute('data-position') || 'bottom-right';
  var theme = script.getAttribute('data-theme') || 'dark';
  var title = script.getAttribute('data-title') || 'Chat with Agent';
  var greeting = script.getAttribute('data-greeting') || 'Hi! How can I help you today?';
  var startersRaw = script.getAttribute('data-starters') || 'What can you help me with?,Tell me about your capabilities,Get started';
  var starters = startersRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

  if (!channelToken) {
    console.error('[Nous Widget] Missing data-agent-channel attribute');
    return;
  }

  var STORAGE_KEY = 'nous_widget_' + channelToken;
  var isOpen = false;
  var messages = [];
  var isStreaming = false;
  var streamingContent = '';
  var streamingStatus = '';
  var suggestedActions = [];
  var hasInteracted = false;

  try {
    var saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      var parsed = JSON.parse(saved);
      messages = parsed.messages || [];
      hasInteracted = parsed.hasInteracted || false;
      suggestedActions = parsed.suggestedActions || [];
    }
  } catch(e) {}

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: messages,
        hasInteracted: hasInteracted,
        suggestedActions: suggestedActions,
      }));
    } catch(e) {}
  }

  var colors = theme === 'light' ? {
    bg: '#ffffff', surface: '#f4f4f5', text: '#18181b', textMuted: '#71717a',
    primary: '#2563eb', primaryText: '#ffffff', border: '#e4e4e7',
    bubbleUser: '#2563eb', bubbleUserText: '#ffffff',
    bubbleBot: '#f4f4f5', bubbleBotText: '#18181b',
    shadow: 'rgba(0,0,0,0.12)',
    chipBg: '#e0e7ff', chipText: '#3730a3', chipBorder: '#c7d2fe',
    codeBg: '#f1f5f9', codeText: '#334155',
    statusBg: '#eff6ff', statusText: '#1d4ed8',
  } : {
    bg: '#1a1a2e', surface: '#16213e', text: '#e4e4e7', textMuted: '#a1a1aa',
    primary: '#3b82f6', primaryText: '#ffffff', border: '#2d2d44',
    bubbleUser: '#3b82f6', bubbleUserText: '#ffffff',
    bubbleBot: '#252545', bubbleBotText: '#e4e4e7',
    shadow: 'rgba(0,0,0,0.3)',
    chipBg: '#1e3a5f', chipText: '#93c5fd', chipBorder: '#2d4a7a',
    codeBg: '#1e293b', codeText: '#94a3b8',
    statusBg: '#1e293b', statusText: '#60a5fa',
  };

  var posStyle = position === 'bottom-left'
    ? 'left: 20px; right: auto;'
    : 'right: 20px; left: auto;';

  var container = document.createElement('div');
  container.id = 'nous-widget-container';
  container.style.cssText = 'position:fixed;bottom:20px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' + posStyle;
  document.body.appendChild(container);

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function renderMarkdown(text) {
    var html = escapeHtml(text);
    html = html.replace(/```([\s\S]*?)```/g, function(_, code) {
      return '<pre style="background:' + colors.codeBg + ';color:' + colors.codeText + ';padding:8px 10px;border-radius:6px;font-size:12px;font-family:monospace;overflow-x:auto;margin:6px 0;white-space:pre-wrap;">' + code.trim() + '</pre>';
    });
    html = html.replace(/`([^`]+)`/g, '<code style="background:' + colors.codeBg + ';color:' + colors.codeText + ';padding:1px 5px;border-radius:3px;font-size:12px;font-family:monospace;">$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?:^|[^*])\*([^*]+)\*(?:[^*]|$)/g, function(match, inner) {
      return match.replace('*' + inner + '*', '<em>' + inner + '</em>');
    });
    html = html.replace(/^[\s]*[-•]\s+(.+)/gm, '<div style="display:flex;gap:6px;margin:2px 0;"><span style="color:' + colors.primary + ';flex-shrink:0;">•</span><span>$1</span></div>');
    html = html.replace(/^[\s]*(\d+)\.\s+(.+)/gm, '<div style="display:flex;gap:6px;margin:2px 0;"><span style="color:' + colors.primary + ';flex-shrink:0;min-width:16px;">$1.</span><span>$2</span></div>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function buildChipsHtml(chips, cssClass) {
    if (!chips || chips.length === 0) return '';
    var html = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">';
    for (var i = 0; i < chips.length; i++) {
      html += '<button class="' + cssClass + '" data-chip="' + escapeHtml(chips[i]) + '" style="padding:6px 12px;border-radius:16px;border:1px solid ' + colors.chipBorder + ';background:' + colors.chipBg + ';color:' + colors.chipText + ';font-size:12px;cursor:pointer;transition:all 0.15s;line-height:1.3;text-align:left;">' + escapeHtml(chips[i]) + '</button>';
    }
    html += '</div>';
    return html;
  }

  function render() {
    var msgHtml = '';

    if (messages.length === 0 && !hasInteracted) {
      msgHtml += '<div style="text-align:center;padding:20px 10px;">';
      msgHtml += '<div style="width:48px;height:48px;border-radius:50%;background:' + colors.primary + ';color:' + colors.primaryText + ';display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:20px;">';
      msgHtml += '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><path d="M10 21v1a2 2 0 0 0 4 0v-1"/></svg>';
      msgHtml += '</div>';
      msgHtml += '<p style="color:' + colors.text + ';font-size:14px;margin:0 0 4px;font-weight:500;">' + escapeHtml(greeting) + '</p>';
      msgHtml += '<p style="color:' + colors.textMuted + ';font-size:12px;margin:0 0 12px;">Choose a topic below or type your own question.</p>';
      msgHtml += buildChipsHtml(starters, 'nous-starter-chip');
      msgHtml += '</div>';
    } else {
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        var align = m.role === 'user' ? 'flex-end' : 'flex-start';
        var bubbleBg = m.role === 'user' ? colors.bubbleUser : colors.bubbleBot;
        var bubbleText = m.role === 'user' ? colors.bubbleUserText : colors.bubbleBotText;
        var radius = m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px';
        var content = m.role === 'user' ? escapeHtml(m.content) : renderMarkdown(m.content);
        msgHtml += '<div style="display:flex;justify-content:' + align + ';margin-bottom:8px;">' +
          '<div style="max-width:85%;padding:10px 14px;border-radius:' + radius + ';background:' + bubbleBg + ';color:' + bubbleText + ';font-size:13px;line-height:1.5;word-wrap:break-word;">' +
          content + '</div></div>';
      }
    }

    if (isStreaming) {
      if (streamingStatus) {
        msgHtml += '<div style="display:flex;justify-content:flex-start;margin-bottom:8px;">' +
          '<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;background:' + colors.statusBg + ';color:' + colors.statusText + ';font-size:12px;">' +
          '<span class="nous-pulse-dot"></span>' +
          '<span>' + escapeHtml(streamingStatus) + '</span>' +
          '</div></div>';
      }
      if (streamingContent) {
        msgHtml += '<div style="display:flex;justify-content:flex-start;margin-bottom:8px;">' +
          '<div style="max-width:85%;padding:10px 14px;border-radius:14px 14px 14px 4px;background:' + colors.bubbleBot + ';color:' + colors.bubbleBotText + ';font-size:13px;line-height:1.5;word-wrap:break-word;">' +
          renderMarkdown(streamingContent) +
          '<span class="nous-cursor"></span>' +
          '</div></div>';
      } else if (!streamingStatus) {
        msgHtml += '<div style="display:flex;justify-content:flex-start;margin-bottom:8px;">' +
          '<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;background:' + colors.statusBg + ';color:' + colors.statusText + ';font-size:12px;">' +
          '<span class="nous-pulse-dot"></span>' +
          '<span>' + escapeHtml(title) + ' is thinking...</span>' +
          '</div></div>';
      }
    }

    if (!isStreaming && suggestedActions.length > 0 && messages.length > 0) {
      msgHtml += buildChipsHtml(suggestedActions, 'nous-action-chip');
    }

    var chatDisplay = isOpen ? 'flex' : 'none';

    container.innerHTML = '<style>' +
      '@keyframes nous-pulse{0%,100%{opacity:1}50%{opacity:0.3}}' +
      '.nous-pulse-dot{width:8px;height:8px;border-radius:50%;background:currentColor;animation:nous-pulse 1.2s infinite;}' +
      '@keyframes nous-blink{0%,100%{opacity:1}50%{opacity:0}}' +
      '.nous-cursor{display:inline-block;width:2px;height:14px;background:' + colors.primary + ';animation:nous-blink 0.8s infinite;margin-left:2px;vertical-align:text-bottom;}' +
      '.nous-starter-chip:hover,.nous-action-chip:hover{filter:brightness(1.1);transform:scale(1.03);}' +
      '#nous-chat-input:focus{outline:none;border-color:' + colors.primary + ';}' +
      '#nous-chat-messages::-webkit-scrollbar{width:4px}' +
      '#nous-chat-messages::-webkit-scrollbar-thumb{background:' + colors.border + ';border-radius:4px}' +
      '@keyframes nous-fab-pulse{0%{box-shadow:0 4px 16px ' + colors.shadow + '}50%{box-shadow:0 4px 16px ' + colors.shadow + ',0 0 0 8px ' + colors.primary + '20}100%{box-shadow:0 4px 16px ' + colors.shadow + '}}' +
      '.nous-fab-new{animation:nous-fab-pulse 2s infinite;}' +
      '</style>' +

      '<div id="nous-chat-window" style="display:' + chatDisplay + ';flex-direction:column;width:380px;height:520px;border-radius:16px;background:' + colors.bg + ';border:1px solid ' + colors.border + ';box-shadow:0 8px 32px ' + colors.shadow + ';margin-bottom:12px;overflow:hidden;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:linear-gradient(135deg,' + colors.primary + ',' + colors.primary + 'dd);color:' + colors.primaryText + ';">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><path d="M10 21v1a2 2 0 0 0 4 0v-1"/></svg>' +
            '</div>' +
            '<div>' +
              '<span style="font-weight:600;font-size:14px;display:block;">' + escapeHtml(title) + '</span>' +
              '<span style="font-size:10px;opacity:0.8;">Online</span>' +
            '</div>' +
          '</div>' +
          '<button id="nous-close-btn" style="background:rgba(255,255,255,0.15);border:none;color:' + colors.primaryText + ';cursor:pointer;padding:6px;font-size:16px;line-height:1;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;" title="Close">&times;</button>' +
        '</div>' +
        '<div id="nous-chat-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;">' +
          msgHtml +
        '</div>' +
        '<div style="padding:12px 16px;border-top:1px solid ' + colors.border + ';background:' + colors.surface + ';">' +
          '<form id="nous-chat-form" style="display:flex;gap:8px;">' +
            '<input id="nous-chat-input" type="text" placeholder="Type your message..." ' +
              'style="flex:1;padding:10px 14px;border-radius:10px;border:1px solid ' + colors.border + ';background:' + colors.bg + ';color:' + colors.text + ';font-size:13px;" ' +
              (isStreaming ? 'disabled' : '') + ' />' +
            '<button type="submit" style="padding:10px 16px;border-radius:10px;border:none;background:' + colors.primary + ';color:' + colors.primaryText + ';cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap;display:flex;align-items:center;justify-content:center;min-width:42px;' + (isStreaming ? 'opacity:0.6;pointer-events:none;' : '') + '">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>' +
            '</button>' +
          '</form>' +
          '<div style="text-align:center;margin-top:6px;"><span style="font-size:10px;color:' + colors.textMuted + ';">Powered by Nous Agent Orchestrator</span></div>' +
        '</div>' +
      '</div>' +

      '<div style="display:flex;justify-content:' + (position === 'bottom-left' ? 'flex-start' : 'flex-end') + ';">' +
        '<button id="nous-fab" class="' + (!isOpen && !hasInteracted ? 'nous-fab-new' : '') + '" style="width:56px;height:56px;border-radius:50%;border:none;background:' + colors.primary + ';color:' + colors.primaryText + ';cursor:pointer;box-shadow:0 4px 16px ' + colors.shadow + ';display:flex;align-items:center;justify-content:center;transition:transform 0.2s;" title="Chat">' +
          (isOpen
            ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
            : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
          ) +
        '</button>' +
      '</div>';

    attachEventListeners();
  }

  function attachEventListeners() {
    var fab = document.getElementById('nous-fab');
    if (fab) {
      fab.addEventListener('click', function() {
        isOpen = !isOpen;
        render();
        if (isOpen) {
          setTimeout(function() {
            var input = document.getElementById('nous-chat-input');
            if (input) input.focus();
            scrollToBottom();
          }, 50);
        }
      });
    }

    var closeBtn = document.getElementById('nous-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        isOpen = false;
        render();
      });
    }

    var form = document.getElementById('nous-chat-form');
    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var input = document.getElementById('nous-chat-input');
        var text = input ? input.value.trim() : '';
        if (!text || isStreaming) return;
        sendMessage(text);
      });
    }

    var starterChips = document.querySelectorAll('.nous-starter-chip');
    for (var i = 0; i < starterChips.length; i++) {
      starterChips[i].addEventListener('click', function() {
        var text = this.getAttribute('data-chip');
        if (text && !isStreaming) sendMessage(text);
      });
    }

    var actionChips = document.querySelectorAll('.nous-action-chip');
    for (var j = 0; j < actionChips.length; j++) {
      actionChips[j].addEventListener('click', function() {
        var text = this.getAttribute('data-chip');
        if (text && !isStreaming) sendMessage(text);
      });
    }
  }

  function scrollToBottom() {
    var el = document.getElementById('nous-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function buildHistoryPayload() {
    var hist = [];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      hist.push((m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.content);
    }
    return hist.slice(-10);
  }

  function sendMessage(text) {
    hasInteracted = true;
    suggestedActions = [];
    messages.push({ role: 'user', content: text });
    isStreaming = true;
    streamingContent = '';
    streamingStatus = '';
    saveState();
    render();
    scrollToBottom();

    var history = buildHistoryPayload();

    fetch(baseUrl + '/api/widget/' + channelToken + '/message-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history }),
    }).then(function(response) {
      if (!response.ok) {
        return response.text().then(function(text) {
          try {
            var data = JSON.parse(text);
            throw new Error(data.message || data.error || 'Request failed');
          } catch(pe) {
            if (pe.message && pe.message !== 'Request failed') throw pe;
            throw new Error('Request failed (' + response.status + ')');
          }
        });
      }

      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function processChunk() {
        return reader.read().then(function(result) {
          if (result.done) {
            finishStream();
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line.startsWith('data: ')) continue;
            var payload = line.substring(6);

            if (payload === '[DONE]') {
              finishStream();
              return;
            }

            try {
              var event = JSON.parse(payload);

              if (event.type === 'text_delta' && event.delta) {
                streamingContent += event.delta;
                streamingStatus = '';
                render();
                scrollToBottom();
              } else if (event.type === 'status') {
                streamingStatus = event.content || '';
                render();
                scrollToBottom();
              } else if (event.type === 'tool_call_start') {
                streamingContent = '';
                streamingStatus = event.content || 'Using tools...';
                render();
                scrollToBottom();
              } else if (event.type === 'llm_thinking' || event.type === 'compliance_check') {
                streamingStatus = event.content || 'Processing...';
                render();
                scrollToBottom();
              } else if (event.type === 'complete') {
                streamingContent = event.content || streamingContent;
                streamingStatus = '';
                render();
                scrollToBottom();
              } else if (event.type === 'suggested_actions') {
                suggestedActions = event.actions || [];
              } else if (event.type === 'error') {
                streamingContent = event.content || 'Something went wrong.';
                streamingStatus = '';
                render();
                scrollToBottom();
              }
            } catch(e) {}
          }

          return processChunk();
        });
      }

      return processChunk();

    }).catch(function(err) {
      isStreaming = false;
      streamingContent = '';
      streamingStatus = '';
      messages.push({ role: 'assistant', content: err.message || 'Connection error. Please try again.' });
      saveState();
      render();
      scrollToBottom();
    });
  }

  function finishStream() {
    isStreaming = false;
    if (streamingContent) {
      messages.push({ role: 'assistant', content: streamingContent });
    }
    streamingContent = '';
    streamingStatus = '';
    saveState();
    render();
    scrollToBottom();
  }

  render();
})();
