// Essence Network live metadata helper
window.EssenceLiveGuide={
  async get(apiBase,channelId){
    const r=await fetch(apiBase+"/channels/"+encodeURIComponent(channelId)+"/guide");
    if(!r.ok) throw new Error("Guide request failed");
    return r.json();
  }
};