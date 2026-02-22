(function() {
  'use strict';

  var script = document.currentScript;
  var channelToken = script.getAttribute('data-agent-channel') || '';
  var baseUrl = script.getAttribute('data-base-url') || script.src.replace(/\/widget\.js.*$/, '');
  var position = script.getAttribute('data-position') || 'bottom-right';
  var theme = script.getAttribute('data-theme') || 'dark';
  var title = script.getAttribute('data-title') || 'Chat with Agent';

  if (!channelToken) {
    console.error('[Nous Widget] Missing data-agent-channel attribute');
    return;
  }

  var isOpen = false;
  var messages = [];
  var isLoading = false;

  var colors = theme === 'light' ? {
    bg: '#ffffff', surface: '#f4f4f5', text: '#18181b', textMuted: '#71717a',
    primary: '#2563eb', primaryText: '#ffffff', border: '#e4e4e7',
    bubbleUser: '#2563eb', bubbleUserText: '#ffffff',
    bubbleBot: '#f4f4f5', bubbleBotText: '#18181b',
    shadow: 'rgba(0,0,0,0.12)'
  } : {
    bg: '#1a1a2e', surface: '#16213e', text: '#e4e4e7', textMuted: '#a1a1aa',
    primary: '#3b82f6', primaryText: '#ffffff', border: '#2d2d44',
    bubbleUser: '#3b82f6', bubbleUserText: '#ffffff',
    bubbleBot: '#252545', bubbleBotText: '#e4e4e7',
    shadow: 'rgba(0,0,0,0.3)'
  };

  var posStyle = position === 'bottom-left'
    ? 'left: 20px; right: auto;'
    : 'right: 20px; left: auto;';

  var container = document.createElement('div');
  container.id = 'nous-widget-container';
  container.style.cssText = 'position:fixed;bottom:20px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' + posStyle;
  document.body.appendChild(container);

  function render() {
    var msgHtml = '';
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var align = m.role === 'user' ? 'flex-end' : 'flex-start';
      var bubbleBg = m.role === 'user' ? colors.bubbleUser : colors.bubbleBot;
      var bubbleText = m.role === 'user' ? colors.bubbleUserText : colors.bubbleBotText;
      var radius = m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px';
      msgHtml += '<div style="display:flex;justify-content:' + align + ';margin-bottom:8px;">' +
        '<div style="max-width:80%;padding:10px 14px;border-radius:' + radius + ';background:' + bubbleBg + ';color:' + bubbleText + ';font-size:13px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap;">' +
        escapeHtml(m.content) + '</div></div>';
    }
    if (isLoading) {
      msgHtml += '<div style="display:flex;justify-content:flex-start;margin-bottom:8px;">' +
        '<div style="padding:10px 14px;border-radius:14px 14px 14px 4px;background:' + colors.bubbleBot + ';color:' + colors.bubbleBotText + ';font-size:13px;">' +
        '<span class="nous-typing"><span>.</span><span>.</span><span>.</span></span></div></div>';
    }

    var chatDisplay = isOpen ? 'flex' : 'none';

    container.innerHTML = '<style>' +
      '@keyframes nous-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}' +
      '.nous-typing span{animation:nous-bounce 1.4s infinite;display:inline-block;font-size:18px;line-height:1;}' +
      '.nous-typing span:nth-child(2){animation-delay:0.2s}' +
      '.nous-typing span:nth-child(3){animation-delay:0.4s}' +
      '#nous-chat-input:focus{outline:none;border-color:' + colors.primary + ';}' +
      '#nous-chat-messages::-webkit-scrollbar{width:4px}' +
      '#nous-chat-messages::-webkit-scrollbar-thumb{background:' + colors.border + ';border-radius:4px}' +
      '</style>' +

      '<div id="nous-chat-window" style="display:' + chatDisplay + ';flex-direction:column;width:360px;height:500px;border-radius:16px;background:' + colors.bg + ';border:1px solid ' + colors.border + ';box-shadow:0 8px 32px ' + colors.shadow + ';margin-bottom:12px;overflow:hidden;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:' + colors.primary + ';color:' + colors.primaryText + ';">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><path d="M10 21v1a2 2 0 0 0 4 0v-1"/></svg>' +
            '<span style="font-weight:600;font-size:14px;">' + escapeHtml(title) + '</span>' +
          '</div>' +
          '<button id="nous-close-btn" style="background:none;border:none;color:' + colors.primaryText + ';cursor:pointer;padding:4px;font-size:18px;line-height:1;" title="Close">&times;</button>' +
        '</div>' +
        '<div id="nous-chat-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;">' +
          (messages.length === 0 ? '<div style="text-align:center;color:' + colors.textMuted + ';font-size:12px;margin-top:40px;"><p style="margin:0 0 4px;">👋 Welcome!</p><p style="margin:0;">Send a message to get started.</p></div>' : msgHtml) +
        '</div>' +
        '<div style="padding:12px 16px;border-top:1px solid ' + colors.border + ';background:' + colors.surface + ';">' +
          '<form id="nous-chat-form" style="display:flex;gap:8px;">' +
            '<input id="nous-chat-input" type="text" placeholder="Type your message..." ' +
              'style="flex:1;padding:10px 14px;border-radius:10px;border:1px solid ' + colors.border + ';background:' + colors.bg + ';color:' + colors.text + ';font-size:13px;" ' +
              (isLoading ? 'disabled' : '') + ' />' +
            '<button type="submit" style="padding:10px 16px;border-radius:10px;border:none;background:' + colors.primary + ';color:' + colors.primaryText + ';cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap;' + (isLoading ? 'opacity:0.6;pointer-events:none;' : '') + '">Send</button>' +
          '</form>' +
          '<div style="text-align:center;margin-top:6px;"><span style="font-size:10px;color:' + colors.textMuted + ';">Powered by Nous Agent Orchestrator</span></div>' +
        '</div>' +
      '</div>' +

      '<div style="display:flex;justify-content:' + (position === 'bottom-left' ? 'flex-start' : 'flex-end') + ';">' +
        '<button id="nous-fab" style="width:56px;height:56px;border-radius:50%;border:none;background:' + colors.primary + ';color:' + colors.primaryText + ';cursor:pointer;box-shadow:0 4px 16px ' + colors.shadow + ';display:flex;align-items:center;justify-content:center;transition:transform 0.2s;" title="Chat">' +
          (isOpen
            ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
            : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
          ) +
        '</button>' +
      '</div>';

    document.getElementById('nous-fab').addEventListener('click', function() {
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
        if (!text || isLoading) return;
        sendMessage(text);
      });
    }
  }

  function scrollToBottom() {
    var el = document.getElementById('nous-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function sendMessage(text) {
    messages.push({ role: 'user', content: text });
    isLoading = true;
    render();
    scrollToBottom();

    var xhr = new XMLHttpRequest();
    xhr.open('POST', baseUrl + '/api/widget/' + channelToken + '/message', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) return;
      isLoading = false;
      try {
        var data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.output) {
          messages.push({ role: 'assistant', content: data.output });
        } else {
          messages.push({ role: 'assistant', content: data.error || data.message || 'Sorry, something went wrong. Please try again.' });
        }
      } catch(e) {
        messages.push({ role: 'assistant', content: 'Sorry, I could not process your request.' });
      }
      render();
      scrollToBottom();
    };
    xhr.onerror = function() {
      isLoading = false;
      messages.push({ role: 'assistant', content: 'Connection error. Please check your network and try again.' });
      render();
      scrollToBottom();
    };
    xhr.send(JSON.stringify({ message: text }));
  }

  render();
})();
