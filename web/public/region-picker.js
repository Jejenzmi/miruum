// Cascading Indonesian region picker: Provinsi → Kab/Kota → Kecamatan → Desa.
// Auto-inits every .region-picker; sets a hidden regionId to the deepest choice.
(function () {
  if (window.__regionPicker) return; window.__regionPicker = true;
  function opt(v, t) { var o = document.createElement("option"); o.value = v; o.textContent = t; return o; }
  async function fetchRegions(params) {
    try { var r = await fetch("/api/regions?" + new URLSearchParams(params)); return (await r.json()).regions || []; }
    catch (e) { return []; }
  }
  function fill(sel, regions, ph) { sel.innerHTML = ""; sel.appendChild(opt("", "— " + ph + " —")); regions.forEach(function (rg) { sel.appendChild(opt(rg.id, rg.name)); }); }
  async function init(el) {
    var prov = el.querySelector(".rp-prov"), city = el.querySelector(".rp-city"),
        dist = el.querySelector(".rp-dist"), vill = el.querySelector(".rp-vill"), idInput = el.querySelector(".rp-id");
    function setId() { idInput.value = vill.value || dist.value || city.value || prov.value || ""; }
    fill(prov, await fetchRegions({ level: "PROVINCE" }), "pilih provinsi");
    prov.addEventListener("change", async function () { fill(city, prov.value ? await fetchRegions({ parentId: prov.value }) : [], "kab/kota"); fill(dist, [], "kecamatan"); fill(vill, [], "desa/kelurahan"); setId(); });
    city.addEventListener("change", async function () { fill(dist, city.value ? await fetchRegions({ parentId: city.value }) : [], "kecamatan"); fill(vill, [], "desa/kelurahan"); setId(); });
    dist.addEventListener("change", async function () { fill(vill, dist.value ? await fetchRegions({ parentId: dist.value }) : [], "desa/kelurahan"); setId(); });
    vill.addEventListener("change", setId);
    var rid = el.getAttribute("data-region-id");
    if (rid) {
      try {
        var path = ((await (await fetch("/api/regions/" + rid + "/path")).json()).path) || [];
        var by = {}; path.forEach(function (p) { by[p.level] = p; });
        if (by.PROVINCE) { prov.value = by.PROVINCE.id; fill(city, await fetchRegions({ parentId: prov.value }), "kab/kota"); }
        if (by.CITY) { city.value = by.CITY.id; fill(dist, await fetchRegions({ parentId: city.value }), "kecamatan"); }
        if (by.DISTRICT) { dist.value = by.DISTRICT.id; fill(vill, await fetchRegions({ parentId: dist.value }), "desa/kelurahan"); }
        if (by.VILLAGE) { vill.value = by.VILLAGE.id; }
        setId();
      } catch (e) {}
    }
  }
  document.addEventListener("DOMContentLoaded", function () { document.querySelectorAll(".region-picker").forEach(init); });
})();
