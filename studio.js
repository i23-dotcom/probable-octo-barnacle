(() => {
  const KEY = "essence_station_v1";
  const defaultState = {channels:[],media:[],activeChannel:null,airing:false};
  let state = JSON.parse(localStorage.getItem(KEY) || "null") || defaultState;

  const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); render(); };
  const $ = id => document.getElementById(id);

  function render(){
    $("statChannels").textContent = state.channels.length;
    $("statMedia").textContent = state.media.length;
    $("statOnAir").textContent = state.airing ? 1 : 0;
    $("statQueue").textContent = state.media.length;
    $("stationStatus").textContent = state.airing ? "● ON AIR" : "STATION OFF AIR";
    $("stationStatus").className = "status " + (state.airing ? "" : "off");

    $("channelList").innerHTML = state.channels.length ? state.channels.map(c =>
      `<div class="channel"><div><b>${esc(c.name)}</b><small>CH ${esc(c.number)} · ${esc(c.category)}</small></div>
      <button class="btnx" data-delete-channel="${c.id}">Delete</button></div>`).join("")
      : `<div class="empty">No channels yet. Create your first channel.</div>`;

    $("mediaList").innerHTML = state.media.length ? state.media.map(m =>
      `<div class="channel"><div><b>${esc(m.title)}</b><small>${esc(m.type)}${m.url ? " · " + esc(m.url) : ""}</small></div>
      <button class="btnx" data-delete-media="${m.id}">Delete</button></div>`).join("")
      : `<div class="empty">No content has been added.</div>`;

    $("playoutChannel").innerHTML = state.channels.length
      ? state.channels.map(c => `<option value="${c.id}" ${state.activeChannel===c.id?"selected":""}>CH ${esc(c.number)} — ${esc(c.name)}</option>`).join("")
      : `<option value="">No channels</option>`;

    const current = state.media[0];
    $("nowTitle").textContent = current ? current.title : "Nothing playing";
    $("nowMeta").textContent = state.airing
      ? "Broadcasting in browser test mode"
      : "Select a channel and start playout.";

    $("queue").innerHTML = state.media.length ? state.media.map((m,i)=>
      `<div class="queue-item"><span>${i+1}</span><div><b>${esc(m.title)}</b><small>${esc(m.type)}</small></div><span>›</span></div>`).join("")
      : `<div class="empty">Queue empty</div>`;

    $("dashboardText").textContent = state.channels.length
      ? `${state.channels.length} channel(s) configured. ${state.airing ? "A channel is currently marked ON AIR." : "Start a channel when you're ready to test playout."}`
      : "Create a channel to begin building your station.";
  }

  function esc(v){ return String(v ?? "").replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x])); }
  function id(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

  $("channelForm").addEventListener("submit", e => {
    e.preventDefault();
    state.channels.push({
      id:id(), name:$("channelName").value.trim(), number:$("channelNumber").value,
      logo:$("channelLogo").value.trim(), category:$("channelCategory").value
    });
    state.activeChannel = state.channels.at(-1).id;
    e.target.reset(); save();
  });

  $("mediaForm").addEventListener("submit", e => {
    e.preventDefault();
    state.media.push({
      id:id(), title:$("mediaTitle").value.trim(),
      type:$("mediaType").value, url:$("mediaUrl").value.trim()
    });
    e.target.reset(); save();
  });

  document.addEventListener("click", e => {
    const dc = e.target.closest("[data-delete-channel]");
    const dm = e.target.closest("[data-delete-media]");
    const go = e.target.closest("[data-go]");
    if(dc){ state.channels = state.channels.filter(c=>c.id!==dc.dataset.deleteChannel); if(!state.channels.length) state.activeChannel=null; save(); }
    if(dm){ state.media = state.media.filter(m=>m.id!==dm.dataset.deleteMedia); save(); }
    if(go){ show(go.dataset.go); }
  });

  $("playoutChannel").addEventListener("change", e => { state.activeChannel=e.target.value; save(); });
  $("startBtn").addEventListener("click", () => { if(state.channels.length){ state.airing=true; state.activeChannel=$("playoutChannel").value; save(); }});
  $("stopBtn").addEventListener("click", () => { state.airing=false; save(); });

  function show(view){
    document.querySelectorAll(".view").forEach(v => v.hidden = v.id !== view);
    document.querySelectorAll(".studio-nav button").forEach(b => b.classList.toggle("active", b.dataset.view===view));
  }
  document.querySelectorAll(".studio-nav button").forEach(b=>b.addEventListener("click",()=>show(b.dataset.view)));

  render();
})();