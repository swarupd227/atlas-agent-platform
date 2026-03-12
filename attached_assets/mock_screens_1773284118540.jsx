import { useState } from "react";

const ServiceNowScreen = () => {
  const [status, setStatus] = useState("pending_approval");
  return (
    <div className="bg-gray-900 min-h-screen text-white">
      <div className="bg-green-800 px-6 py-3 flex items-center gap-3">
        <span className="text-xl font-bold">ServiceNow</span>
        <span className="text-green-200 text-sm">IT Service Management</span>
        <span className="ml-auto text-sm text-green-200">BlackRock Enterprise</span>
      </div>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs bg-yellow-600 text-white px-2 py-0.5 rounded">REQ0084721</span>
          <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded">AI / Synthetic Worker</span>
        </div>
        <h2 className="text-2xl font-bold mb-4">Synthetic Worker Access Request</h2>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-bold text-green-400 mb-3 uppercase tracking-wider">Request Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400">Requested By:</span><br/><span className="font-semibold">David Chen, Head of Fund Operations</span></div>
                <div><span className="text-gray-400">Department:</span><br/><span className="font-semibold">Investment Operations</span></div>
                <div><span className="text-gray-400">Request Type:</span><br/><span className="font-semibold text-orange-400">New Synthetic Worker</span></div>
                <div><span className="text-gray-400">Priority:</span><br/><span className="font-semibold text-yellow-400">High</span></div>
                <div className="col-span-2"><span className="text-gray-400">Business Justification:</span><br/><span>"Our team processes 2,000+ AIM Notify provisioning tasks per quarter at 45 min each. We need a synthetic worker to automate standard provisioning, deprovisioning, and entitlement changes for our AIM Notify applications, freeing analysts for complex exception handling."</span></div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-bold text-blue-400 mb-3 uppercase tracking-wider">Target Applications (Access Required)</h3>
              <div className="space-y-2">
                {[
                  {app:"Aladdin OMS", access:"AIM_Notify_Processor role", risk:"Medium"},
                  {app:"Charles River IMS", access:"Order_Viewer, Provision_Agent roles", risk:"Medium"},
                  {app:"Bloomberg Terminal", access:"Data_Reader role", risk:"Low"},
                  {app:"ServiceNow", access:"Task_Processor, Ticket_Creator roles", risk:"Low"},
                ].map((a,i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-700 rounded px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🏢</span>
                      <div>
                        <div className="font-semibold text-sm">{a.app}</div>
                        <div className="text-xs text-gray-400">{a.access}</div>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${a.risk==="Medium"?"bg-yellow-600":"bg-green-600"}`}>{a.risk} Risk</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-bold text-purple-400 mb-3 uppercase tracking-wider">Proposed Governance</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400">Operational Owner (= Manager):</span><br/><span className="font-semibold">Michael Yoder, AIM Team Lead</span></div>
                <div><span className="text-gray-400">Executive Sponsor:</span><br/><span className="font-semibold">Ian Hogg, VP Technology</span></div>
                <div><span className="text-gray-400">Authentication Method:</span><br/><span className="font-semibold text-cyan-400">X.509 Certificate (90-day rotation)</span></div>
                <div><span className="text-gray-400">Orchestration Platform:</span><br/><span className="font-semibold text-orange-400">Atlas Agent Orchestrator</span></div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-bold text-yellow-400 mb-3 uppercase tracking-wider">Approval Chain</h3>
              <div className="space-y-3">
                {[
                  {role:"IT Security Review", person:"Sarah Kim, CISO Office", status:"approved", date:"Mar 5"},
                  {role:"AI Risk Operating Committee", person:"AI ROC Board", status: status==="approved"?"approved":"pending", date: status==="approved"?"Mar 7":"Pending"},
                  {role:"AIM Team Acceptance", person:"Michael Yoder", status: status==="approved"?"approved":"waiting", date: status==="approved"?"Mar 8":"Waiting"},
                ].map((a,i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`mt-0.5 text-sm ${a.status==="approved"?"text-green-400":a.status==="pending"?"text-yellow-400":"text-gray-500"}`}>
                      {a.status==="approved"?"✅":a.status==="pending"?"⏳":"⏸️"}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{a.role}</div>
                      <div className="text-xs text-gray-400">{a.person}</div>
                      <div className="text-xs text-gray-500">{a.date}</div>
                    </div>
                  </div>
                ))}
              </div>
              {status === "pending_approval" && (
                <button onClick={() => setStatus("approved")} className="mt-4 w-full bg-green-600 hover:bg-green-500 text-white py-2 rounded font-semibold text-sm transition-colors">
                  ✅ Simulate: AI ROC Approves
                </button>
              )}
              {status === "approved" && (
                <div className="mt-4 bg-green-900 border border-green-600 rounded p-2 text-center text-sm text-green-300 font-semibold">
                  ✅ All Approvals Complete — Ready for AIM Team to Onboard via Atlas
                </div>
              )}
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-bold text-red-400 mb-3 uppercase tracking-wider">Risk Assessment (Auto)</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Data Sensitivity</span><span className="text-yellow-400">Medium (MNPI via Aladdin)</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Regulatory Impact</span><span className="text-yellow-400">SOX, FINRA 3110</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Overall Risk Tier</span><span className="font-bold text-yellow-400">Tier 2</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RadiantOneScreen = () => {
  const [expanded, setExpanded] = useState(null);
  const identities = [
    {id:"EMP-10421", name:"Sarah Chen", type:"Employee", dept:"Public Equities", owner:"Direct", status:"Active", risk:"Low", lastAct:"2 min ago"},
    {id:"EMP-10522", name:"John Park", type:"Employee", dept:"Private Credit", owner:"Direct", status:"Active", risk:"Low", lastAct:"15 min ago"},
    {id:"EMP-10893", name:"Lisa Wang", type:"Employee", dept:"AIM", owner:"Direct", status:"Active", risk:"Low", lastAct:"1 hr ago"},
    {id:"EMP-11204", name:"Michael Yoder", type:"Employee", dept:"AIM", owner:"Direct", status:"Active", risk:"Low", lastAct:"5 min ago"},
    {id:"CON-20045", name:"James Liu", type:"Contractor", dept:"IT Ops", owner:"Vendor Mgr", status:"Active", risk:"Medium", lastAct:"3 hrs ago"},
    {id:"SVC-30012", name:"Aladdin-SVC-Batch", type:"Service Acct", dept:"Technology", owner:"System", status:"Active", risk:"Medium", lastAct:"30 min ago"},
    {id:"SYN-40001", name:"AIM-SYNTH-001", type:"Synthetic Worker", dept:"AIM", owner:"M. Yoder", status:"Active", risk:"Low", lastAct:"Just now"},
  ];
  const typeColors = {Employee:"bg-blue-600", Contractor:"bg-teal-600", "Service Acct":"bg-gray-500", "Synthetic Worker":"bg-orange-500"};
  return (
    <div className="bg-gray-950 min-h-screen text-white">
      <div className="bg-purple-900 px-6 py-3 flex items-center gap-3">
        <span className="text-xl font-bold">RadiantOne</span>
        <span className="text-purple-300 text-sm">Identity Data Platform</span>
        <span className="ml-auto text-sm text-purple-300">Unified Identity Fabric</span>
      </div>
      <div className="flex">
        <div className="w-48 bg-gray-900 min-h-screen p-3 space-y-1 text-sm">
          {["Dashboard","Identities","Analytics","Observability","SoD Rules","Settings"].map(n => (
            <div key={n} className={`px-3 py-2 rounded cursor-pointer ${n==="Identities"?"bg-purple-800 text-white":"text-gray-400 hover:bg-gray-800"}`}>{n}</div>
          ))}
        </div>
        <div className="flex-1 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">All Identities</h2>
            <div className="flex gap-2">
              <input className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm w-64" placeholder="Search identities..." />
              <select className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm">
                <option>Type: All</option><option>Employee</option><option>Contractor</option><option>Synthetic Worker</option>
              </select>
            </div>
          </div>
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                <th className="text-left p-3">Identity ID</th><th className="text-left p-3">Name</th><th className="text-left p-3">Type</th>
                <th className="text-left p-3">Department</th><th className="text-left p-3">Owner</th><th className="text-left p-3">Status</th>
                <th className="text-left p-3">Risk</th><th className="text-left p-3">Last Activity</th>
              </tr></thead>
              <tbody>
                {identities.map((id,i) => (
                  <tr key={i} onClick={() => setExpanded(expanded===i?null:i)}
                    className={`border-t border-gray-800 cursor-pointer transition-colors ${id.type==="Synthetic Worker"?"bg-orange-950 hover:bg-orange-900":"hover:bg-gray-800"} ${expanded===i?"bg-gray-800":""}`}>
                    <td className="p-3 font-mono text-xs">{id.id}</td>
                    <td className="p-3 font-semibold flex items-center gap-2">
                      {id.type==="Synthetic Worker"&&<span>🤖</span>}{id.name}
                    </td>
                    <td className="p-3"><span className={`${typeColors[id.type]} text-white text-xs px-2 py-0.5 rounded`}>{id.type}</span></td>
                    <td className="p-3">{id.dept}</td><td className="p-3">{id.owner}</td>
                    <td className="p-3"><span className="text-green-400">● {id.status}</span></td>
                    <td className="p-3"><span className={id.risk==="Medium"?"text-yellow-400":"text-green-400"}>{id.risk}</span></td>
                    <td className="p-3 text-gray-400">{id.lastAct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {expanded === 6 && (
              <div className="bg-orange-950 border-t-2 border-orange-500 p-4">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div><span className="text-gray-400">Owner</span><br/><span className="font-semibold">Michael Yoder</span></div>
                  <div><span className="text-gray-400">Executive Sponsor</span><br/><span className="font-semibold">Ian Hogg</span></div>
                  <div><span className="text-gray-400">Credential</span><br/><span className="font-semibold text-cyan-400">X.509 Certificate</span></div>
                  <div><span className="text-gray-400">Cert Expiry</span><br/><span className="font-semibold">Jun 12, 2026 (92 days)</span></div>
                  <div><span className="text-gray-400">Created</span><br/><span className="font-semibold">Mar 8, 2026</span></div>
                  <div><span className="text-gray-400">Autonomy Phase</span><br/><span className="font-semibold text-orange-400">Guided</span></div>
                  <div><span className="text-gray-400">Tasks Processed</span><br/><span className="font-semibold text-green-400">2,147</span></div>
                  <div><span className="text-gray-400">Accuracy</span><br/><span className="font-semibold text-green-400">99.72%</span></div>
                </div>
                <div className="mt-3 text-xs text-orange-300">
                  ℹ️ This synthetic worker identity was created by Atlas and synced to SailPoint for access governance and Brainwave for recertification.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SailPointScreen = () => {
  const [activeTab, setActiveTab] = useState("accounts");
  const tabs = ["accounts","entitlements","certifications","activity"];
  const accounts = [
    {app:"Aladdin OMS", acct:"aim-synth-001@aladdin", status:"Active", role:"AIM_Notify_Processor", provisioned:"Mar 8, 2026", lastUsed:"2 min ago"},
    {app:"Charles River IMS", acct:"synth-proc-001", status:"Active", role:"Order_Viewer, Provision_Agent", provisioned:"Mar 8, 2026", lastUsed:"8 min ago"},
    {app:"Bloomberg Terminal", acct:"BRK-SYNTH-001", status:"Active", role:"Data_Reader", provisioned:"Mar 8, 2026", lastUsed:"15 min ago"},
    {app:"ServiceNow", acct:"aim.synth.001", status:"Active", role:"Task_Processor", provisioned:"Mar 8, 2026", lastUsed:"1 min ago"},
  ];
  return (
    <div className="bg-white min-h-screen text-gray-800">
      <div className="bg-blue-800 px-6 py-3 flex items-center gap-3">
        <span className="text-xl font-bold text-white">SailPoint IdentityIQ</span>
        <span className="text-blue-200 text-sm">Identity Governance</span>
        <span className="ml-auto text-sm text-blue-200">BlackRock Enterprise</span>
      </div>
      <div className="p-6">
        <div className="flex gap-6">
          <div className="w-72 bg-blue-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white text-xl">🤖</div>
              <div>
                <div className="font-bold text-lg">AIM-SYNTH-001</div>
                <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded">Synthetic Worker</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Owner (Manager)","Michael Yoder"],["Executive Sponsor","Ian Hogg"],["Department","AIM"],
                ["Lifecycle State","Active"],["Authentication","X.509 Certificate"],
                ["Risk Score",<span key="r" className="text-green-600 font-semibold">Low</span>],
                ["Policy Violations",<span key="p" className="text-green-600 font-semibold">0 ✓</span>],
                ["SoD Status",<span key="s" className="text-green-600 font-semibold">Clean ✓</span>],
              ].map(([k,v],i) => (
                <div key={i} className="flex justify-between border-b border-gray-200 pb-1">
                  <span className="text-gray-500">{k}</span><span className="font-semibold text-right">{v}</span>
                </div>
              ))}
            </div>
            <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700">
              ✅ Access provisioned through standard SailPoint workflow. Owner approved. SoD validated.
            </div>
          </div>

          <div className="flex-1">
            <div className="flex border-b border-gray-200 mb-4">
              {tabs.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-4 py-2 text-sm font-semibold capitalize ${activeTab===t?"border-b-2 border-blue-600 text-blue-600":"text-gray-400 hover:text-gray-600"}`}>
                  {t}
                </button>
              ))}
            </div>

            {activeTab === "accounts" && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Application Accounts (4)</h3>
                {accounts.map((a,i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center text-blue-600">🏢</div>
                      <div>
                        <div className="font-semibold">{a.app}</div>
                        <div className="text-xs text-gray-400">{a.acct} · {a.role}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-semibold">{a.status}</span>
                      <div className="text-xs text-gray-400 mt-1">Last used: {a.lastUsed}</div>
                    </div>
                  </div>
                ))}
                <div className="bg-blue-50 rounded p-3 mt-3 text-xs text-blue-700">
                  <strong>Approval History:</strong> Access Requested (Mar 7) → SoD Validated (Mar 7) → Owner Approved: Michael Yoder (Mar 8) → Provisioned via Aquera Connectors (Mar 8)
                </div>
              </div>
            )}

            {activeTab === "entitlements" && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Entitlements (12)</h3>
                {[
                  {app:"Aladdin OMS",ent:"AIM_Notify_Processor",type:"Role",risk:"Medium",source:"Aquera Catalog"},
                  {app:"Aladdin OMS",ent:"Fund_Data_Reader",type:"Permission",risk:"Low",source:"Aquera Catalog"},
                  {app:"Charles River",ent:"Order_Viewer",type:"Role",risk:"Low",source:"Aquera Catalog"},
                  {app:"Charles River",ent:"Provision_Agent",type:"Role",risk:"Medium",source:"Aquera Catalog"},
                  {app:"Bloomberg",ent:"Data_Reader",type:"Role",risk:"Low",source:"Aquera Catalog"},
                  {app:"ServiceNow",ent:"Task_Processor",type:"Role",risk:"Low",source:"Aquera Catalog"},
                ].map((e,i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-28">{e.app}</span>
                      <span className="font-semibold">{e.ent}</span>
                      <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded">{e.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${e.risk==="Medium"?"bg-yellow-100 text-yellow-700":"bg-green-100 text-green-700"}`}>{e.risk}</span>
                      <span className="text-xs text-teal-600">{e.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "certifications" && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Certification Status</h3>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-purple-800">Q2 2026 AIM Team Recertification</span>
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-semibold">Scheduled</span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>Certifier: <strong>Michael Yoder</strong> (Operational Owner)</div>
                    <div>Campaign Due: <strong>April 30, 2026</strong></div>
                    <div>Items to Certify: <strong>4 applications, 12 entitlements</strong></div>
                    <div>Recommendation: <span className="text-green-600 font-semibold">Certify (all entitlements actively used)</span></div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">Note: Brainwave/RadiantOne manages certification campaigns. SailPoint routes to the Operational Owner (replaces manager for synthetic workers).</div>
              </div>
            )}

            {activeTab === "activity" && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Recent Activity (via Atlas Pipeline)</h3>
                {[
                  {time:"2 min ago", action:"Provisioned account for new hire J. Martinez", app:"Aladdin OMS", status:"✅ Verified"},
                  {time:"8 min ago", action:"Modified entitlements for role change K. Patel", app:"Charles River", status:"✅ Verified"},
                  {time:"22 min ago", action:"Deactivated account for termination R. Singh", app:"Bloomberg", status:"✅ Verified"},
                  {time:"35 min ago", action:"Provisioned account for new hire A. Kim", app:"ServiceNow", status:"✅ Verified"},
                  {time:"1 hr ago", action:"SoD pre-check blocked: toxic combination detected", app:"Aladdin OMS", status:"⚠️ Escalated"},
                ].map((a,i) => (
                  <div key={i} className="bg-gray-50 rounded px-3 py-2 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-16">{a.time}</span>
                      <span>{a.action}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{a.app}</span>
                      <span className="text-xs">{a.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const BrainwaveScreen = () => {
  const [certified, setCertified] = useState({});
  const identities = [
    {name:"Sarah Chen",type:"Employee",apps:6,ents:24,certifier:"Tom Walsh",status:"Certified",risk:"Low"},
    {name:"John Park",type:"Employee",apps:5,ents:19,certifier:"Tom Walsh",status:"Certified",risk:"Low"},
    {name:"Lisa Wang",type:"Employee",apps:4,ents:15,certifier:"Michael Yoder",status:"Certified",risk:"Low"},
    {name:"David Kim",type:"Employee",apps:7,ents:31,certifier:"Michael Yoder",status:"Pending",risk:"Medium"},
    {name:"Emily Zhang",type:"Employee",apps:3,ents:11,certifier:"Michael Yoder",status:"Certified",risk:"Low"},
    {name:"AIM-SYNTH-001",type:"Synthetic Worker",apps:4,ents:12,certifier:"Michael Yoder",status: certified["synth"]?"Certified":"Pending",risk:"Low"},
  ];
  return (
    <div className="bg-gray-950 min-h-screen text-white">
      <div className="bg-purple-800 px-6 py-3 flex items-center gap-3">
        <span className="text-xl font-bold">Brainwave</span>
        <span className="text-purple-300 text-sm">/ RadiantOne Identity Analytics</span>
        <span className="ml-auto text-sm text-purple-300">Access Recertification</span>
      </div>
      <div className="p-6">
        <div className="bg-gray-900 rounded-lg p-4 mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Q2 2026 AIM Team Access Recertification</h2>
            <div className="text-sm text-gray-400 mt-1">Campaign Due: April 30, 2026 · 6 identities · {certified["synth"]?6:5} of 6 certified</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold text-green-400">{certified["synth"]?"100%":"83%"}</div>
              <div className="text-xs text-gray-400">Complete</div>
            </div>
            <span className={`text-xs px-3 py-1 rounded font-semibold ${certified["synth"]?"bg-green-600":"bg-yellow-600"}`}>
              {certified["synth"]?"Completed":"In Progress"}
            </span>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-800 text-gray-400 text-xs uppercase">
              <th className="text-left p-3">Identity</th><th className="text-left p-3">Type</th><th className="text-left p-3">Apps</th>
              <th className="text-left p-3">Entitlements</th><th className="text-left p-3">Certifier</th><th className="text-left p-3">Status</th>
              <th className="text-left p-3">Risk</th><th className="text-left p-3">Recommendation</th><th className="p-3">Action</th>
            </tr></thead>
            <tbody>
              {identities.map((id,i) => (
                <tr key={i} className={`border-t border-gray-800 ${id.type==="Synthetic Worker"?"bg-orange-950":""}`}>
                  <td className="p-3 font-semibold flex items-center gap-2">
                    {id.type==="Synthetic Worker"&&<span>🤖</span>}{id.name}
                  </td>
                  <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded ${id.type==="Synthetic Worker"?"bg-orange-500":"bg-blue-600"} text-white`}>{id.type}</span></td>
                  <td className="p-3">{id.apps}</td>
                  <td className="p-3">{id.ents}</td>
                  <td className="p-3">{id.certifier}</td>
                  <td className="p-3"><span className={id.status==="Certified"?"text-green-400":"text-yellow-400"}>● {id.status}</span></td>
                  <td className="p-3"><span className={id.risk==="Medium"?"text-yellow-400":"text-green-400"}>{id.risk}</span></td>
                  <td className="p-3"><span className="text-green-400 text-xs">✓ Certify</span></td>
                  <td className="p-3 text-center">
                    {id.type==="Synthetic Worker" && id.status==="Pending" ? (
                      <button onClick={() => setCertified({...certified, synth:true})} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs font-semibold">
                        Certify All
                      </button>
                    ) : id.status==="Pending" ? (
                      <span className="text-yellow-400 text-xs">Awaiting</span>
                    ) : (
                      <span className="text-green-400 text-xs">✅</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {identities[5].type==="Synthetic Worker" && (
          <div className="bg-orange-950 border border-orange-700 rounded-lg p-4 mt-4">
            <h3 className="font-bold text-orange-400 mb-2">🤖 AIM-SYNTH-001 — Synthetic Worker Certification Details</h3>
            <div className="grid grid-cols-4 gap-4 text-sm mb-3">
              <div className="bg-gray-900 rounded p-2 text-center">
                <div className="text-2xl font-bold text-green-400">2,147</div>
                <div className="text-xs text-gray-400">Tasks Processed</div>
              </div>
              <div className="bg-gray-900 rounded p-2 text-center">
                <div className="text-2xl font-bold text-green-400">99.72%</div>
                <div className="text-xs text-gray-400">Accuracy</div>
              </div>
              <div className="bg-gray-900 rounded p-2 text-center">
                <div className="text-2xl font-bold text-cyan-400">1.8 min</div>
                <div className="text-xs text-gray-400">Avg Processing Time</div>
              </div>
              <div className="bg-gray-900 rounded p-2 text-center">
                <div className="text-2xl font-bold text-green-400">0</div>
                <div className="text-xs text-gray-400">Security Incidents</div>
              </div>
            </div>
            <div className="text-xs text-orange-300">
              Atlas-provided insight: All 4 application entitlements actively used in the last 30 days. No excess access detected. Worker operating in Guided Autonomy phase. Recommend: Certify all access.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function DemoMockScreens() {
  const [screen, setScreen] = useState("servicenow");
  const screens = [
    {id:"servicenow", label:"① ServiceNow Request", color:"bg-green-700"},
    {id:"radiantone", label:"② RadiantOne Identity", color:"bg-purple-700"},
    {id:"sailpoint", label:"③ SailPoint Identity Cube", color:"bg-blue-700"},
    {id:"brainwave", label:"④ Brainwave Recertification", color:"bg-purple-800"},
  ];
  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gray-900 px-4 py-2 flex items-center gap-2 border-b border-gray-700">
        <span className="text-orange-400 font-bold text-sm mr-2">DEMO MOCK SCREENS</span>
        {screens.map(s => (
          <button key={s.id} onClick={() => setScreen(s.id)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${screen===s.id?`${s.color} text-white ring-2 ring-white`:"bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
            {s.label}
          </button>
        ))}
      </div>
      {screen==="servicenow" && <ServiceNowScreen/>}
      {screen==="radiantone" && <RadiantOneScreen/>}
      {screen==="sailpoint" && <SailPointScreen/>}
      {screen==="brainwave" && <BrainwaveScreen/>}
    </div>
  );
}
