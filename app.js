/* =====================================================
   관극 아카이브 — app.js
   Notion API + Google Drive 연동
   ===================================================== */

// ──────────────────────────────────────────
// ⚙️  설정 (본인 값으로 교체하세요)
// ──────────────────────────────────────────
const CONFIG = {
  DATA_URL: "./data.json",           // GitHub Actions가 매일 생성
  DRIVE_FOLDER: "1IEOuLpC76B0YbTymIO32qVKzFKGSYJFW",
};

// ──────────────────────────────────────────
// 🎭 MOCK 데이터 (실제 API 연동 전 UI 확인용)
// ──────────────────────────────────────────
const MOCK_REVIEWS = [
  { id:"1", title:"레미제라블", date:"2025-06-01", venue:"블루스퀘어", rating:5, review:"오늘도 2막에서 울었다. 장발장의 마지막 장면은 볼 때마다 새롭다.", driveImg:null },
  { id:"2", title:"오페라의 유령", date:"2025-05-28", venue:"샤롯데씨어터", rating:4, review:"크리스틴의 목소리가 특히 좋았던 날. 팬텀의 연기도 압도적.", driveImg:null },
  { id:"3", title:"엘리자벳", date:"2025-05-20", venue:"예술의전당", rating:5, review:"죽음(토트)이 너무 매력적이었다. 엘리자벳과의 케미가 폭발.", driveImg:null },
  { id:"4", title:"캣츠", date:"2025-04-15", venue:"충무아트센터", rating:4.5, review:"메모리 한 곡으로 모든 게 용서되는 뮤지컬.", driveImg:null },
  { id:"5", title:"위키드", date:"2025-04-02", venue:"블루스퀘어", rating:4, review:"글린다와 엘파바의 우정이 너무 좋았다.", driveImg:null },
  { id:"6", title:"지킬앤하이드", date:"2025-03-20", venue:"LG아트센터", rating:5, review:"투혼을 보여주는 배우. 1인 2역 전환이 소름 돋았다.", driveImg:null },
  { id:"7", title:"노트르담 드 파리", date:"2025-03-08", venue:"예술의전당", rating:4.5, review:"음악이 너무 좋아서 OST를 3일 내내 들었다.", driveImg:null },
  { id:"8", title:"마리 퀴리", date:"2025-02-14", venue:"충무아트센터", rating:4, review:"여성 과학자를 뮤지컬로 만나는 색다른 경험.", driveImg:null },
  { id:"9", title:"스위니토드", date:"2025-01-25", venue:"블루스퀘어", rating:5, review:"다크하고 강렬한 무대. 이런 장르를 더 보고 싶다.", driveImg:null },
  { id:"10", title:"헤드윅", date:"2024-12-20", venue:"홍익대아트센터", rating:5, review:"배우와 관객이 하나 되는 특별한 경험.", driveImg:null },
  { id:"11", title:"아이다", date:"2024-12-05", venue:"샤롯데씨어터", rating:4, review:"웅장한 무대 세트와 화려한 의상이 인상적.", driveImg:null },
  { id:"12", title:"모차르트!", date:"2024-11-18", venue:"예술의전당", rating:5, review:"나는 나는 나는! 이 곡은 평생 잊을 수 없을 것 같다.", driveImg:null },
];

// ──────────────────────────────────────────
// 📦 data.json 로드 (GitHub Actions가 매일 생성)
// ──────────────────────────────────────────
async function loadData() {
  const res = await fetch(CONFIG.DATA_URL + "?t=" + Date.now());
  if (!res.ok) throw new Error("data.json 로드 실패");
  const json = await res.json();
  return json.reviews || [];
}

function normalizeDate(raw) {
  if (!raw) return "";
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // Parse other formats (e.g. "Sep 26, 2017")
  const d = new Date(raw);
  if (isNaN(d)) return raw;
  return d.toISOString().slice(0, 10);
}

function parseReview(page) {
  const props = page.properties;
  const rawDate = props["날짜"]?.date?.start || "";
  return {
    id: page.id,
    title: props["공연명"]?.title?.[0]?.plain_text || "(제목 없음)",
    date:  normalizeDate(rawDate),
    venue: props["공연장"]?.rich_text?.[0]?.plain_text || props["장소"]?.rich_text?.[0]?.plain_text || "",
    rating: (() => {
      const p = props["별점"];
      if (!p) return 0;
      if (typeof p.number === "number") return p.number;
      if (p.rollup?.number !== undefined) return p.rollup.number;
      if (p.rollup?.array?.[0]?.number !== undefined) return p.rollup.array[0].number;
      return 0;
    })(),
    review: props["후기"]?.rich_text?.[0]?.plain_text || "",
    driveImg: props["사진"]?.url || null,
  };
}

// ──────────────────────────────────────────
// 📸 Google Drive 썸네일 URL
// ──────────────────────────────────────────
function driveThumb(fileId, size = 200) {
  if (!fileId) return null;
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
}

// ──────────────────────────────────────────
// ⭐ 별 렌더링
// ──────────────────────────────────────────
function renderStars(rating) {
  // 10점 만점 → 5칸 별로 표시 (반올림)
  if (!rating) return "☆☆☆☆☆";
  const stars = Math.round(rating / 2);
  const empty = Math.max(0, 5 - stars);
  return "★".repeat(stars) + "☆".repeat(empty);
}

function starLabel(rating) {
  if (!rating) return "★ —";
  return `★ ${rating % 1 === 0 ? rating + ".0" : rating} / 10`;
}

// ──────────────────────────────────────────
// 🗂 전역 상태
// ──────────────────────────────────────────
let allReviews = [];
let calYear, calMonth;
let bigCalYear, bigCalMonth;

// ──────────────────────────────────────────
// 📊 통계 계산
// ──────────────────────────────────────────
function calcStats(reviews) {
  const now = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  const total = reviews.length;
  const yearC = reviews.filter(r => r.date.startsWith(String(thisYear))).length;
  const monthC = reviews.filter(r => {
    const [y, m] = r.date.split("-");
    return parseInt(y) === thisYear && parseInt(m) === thisMonth;
  }).length;
  const rated = reviews.filter(r => r.rating > 0);
  const avg = rated.length
    ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1)
    : "—";

  return { total, yearC, monthC, avg };
}

function updateStatBar(stats) {
  document.getElementById("totalCount").textContent = stats.total;
  document.getElementById("yearCount").textContent  = stats.yearC;
  document.getElementById("monthCount").textContent = stats.monthC;
  document.getElementById("avgRating").textContent  = stats.avg;
}

// ──────────────────────────────────────────
// 🃏 카드 렌더링
// ──────────────────────────────────────────
function makeCardEl(r) {
  const card = document.createElement("div");
  card.className = "pcard";
  card.onclick = () => openModal(r);

  const thumb = r.driveImg ? driveThumb(r.driveImg) : null;
  const imgContent = thumb
    ? `<img src="${thumb}" alt="${r.title}" loading="lazy"><span class="emoji-fallback" style="opacity:0">🎭</span>`
    : `<span class="emoji-fallback">🎭</span>`;

  card.innerHTML = `
    <div class="pcard-img">${imgContent}</div>
    <div class="pcard-body">
      <div class="pcard-name">${r.title}</div>
      <div class="pcard-date">${r.date}${r.venue ? " · " + r.venue : ""}</div>
      <div class="pcard-star">${renderStars(r.rating)}</div>
    </div>`;
  return card;
}

function renderRecentCards(reviews) {
  const el = document.getElementById("recentCards");
  el.innerHTML = "";
  const recent = [...reviews].sort((a,b) => b.date.localeCompare(a.date)).slice(0,6);
  if (!recent.length) { el.innerHTML = `<div class="empty-state">관극 기록이 없어요</div>`; return; }
  recent.forEach(r => el.appendChild(makeCardEl(r)));
}

// ──────────────────────────────────────────
// 📋 TOP 별점 리스트
// ──────────────────────────────────────────
function renderTopRated(reviews) {
  const el = document.getElementById("topRatedList");
  el.innerHTML = "";
  const top = [...reviews]
    .filter(r => r.rating > 0)
    .sort((a,b) => b.rating - a.rating || b.date.localeCompare(a.date))
    .slice(0, 5);
  if (!top.length) { el.innerHTML = `<div class="empty-state">데이터 없음</div>`; return; }
  top.forEach(r => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.onclick = () => openModal(r);
    const thumb = r.driveImg ? driveThumb(r.driveImg, 80) : null;
    row.innerHTML = `
      <div class="list-icon">${thumb ? `<img src="${thumb}" loading="lazy">` : "🎭"}</div>
      <div class="list-main">
        <div class="list-name">${r.title}</div>
        <div class="list-sub">${r.venue || "—"}</div>
      </div>
      <div class="list-score">${starLabel(r.rating)}</div>`;
    el.appendChild(row);
  });
}

// ──────────────────────────────────────────
// 🏟 공연장 태그
// ──────────────────────────────────────────
function renderVenueTags(reviews) {
  const el = document.getElementById("venueTags");
  el.innerHTML = "";
  const count = {};
  reviews.forEach(r => { if (r.venue) count[r.venue] = (count[r.venue]||0) + 1; });
  const sorted = Object.entries(count).sort((a,b) => b[1]-a[1]).slice(0,8);
  if (!sorted.length) { el.innerHTML = `<div class="empty-state">데이터 없음</div>`; return; }
  sorted.forEach(([venue, cnt]) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `${venue} ${cnt}`;
    tag.onclick = () => {
      switchTab("list");
      renderFullList(allReviews.filter(r => r.venue === venue));
    };
    el.appendChild(tag);
  });
}

// ──────────────────────────────────────────
// 📅 미니 달력
// ──────────────────────────────────────────
function renderMiniCal(reviews) {
  const monthEl = document.getElementById("calMonth");
  const gridEl  = document.getElementById("calGrid");

  monthEl.textContent = `${calYear}년 ${calMonth}월`;
  gridEl.innerHTML = "";

  const reviewDates = new Set(
    reviews
      .filter(r => {
        const [y,m] = r.date.split("-");
        return parseInt(y)===calYear && parseInt(m)===calMonth;
      })
      .map(r => parseInt(r.date.split("-")[2]))
  );

  const firstDay = new Date(calYear, calMonth-1, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const today = new Date();

  for (let i=0; i<firstDay; i++) {
    const d = document.createElement("div");
    d.className = "cal-day empty";
    d.textContent = ".";
    gridEl.appendChild(d);
  }
  for (let d=1; d<=daysInMonth; d++) {
    const el = document.createElement("div");
    const isToday = today.getFullYear()===calYear && today.getMonth()+1===calMonth && today.getDate()===d;
    const hasShow = reviewDates.has(d);
    el.className = "cal-day" + (isToday ? " today" : "") + (hasShow ? " has" : "");
    el.textContent = d;
    if (hasShow) {
      el.title = reviews.filter(r => r.date === `${calYear}-${String(calMonth).padStart(2,"0")}-${String(d).padStart(2,"0")}`).map(r=>r.title).join(", ");
    }
    gridEl.appendChild(el);
  }
}

// ──────────────────────────────────────────
// 📅 큰 달력
// ──────────────────────────────────────────
function renderBigCal(reviews) {
  const monthEl = document.getElementById("bigCalMonth");
  const gridEl  = document.getElementById("bigCalGrid");

  monthEl.textContent = `${bigCalYear}년 ${bigCalMonth}월`;
  gridEl.innerHTML = "";

  const byDate = {};
  reviews.forEach(r => {
    const [y,m,d] = r.date.split("-");
    if (parseInt(y)===bigCalYear && parseInt(m)===bigCalMonth) {
      const key = parseInt(d);
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(r);
    }
  });

  const firstDay = new Date(bigCalYear, bigCalMonth-1, 1).getDay();
  const daysInMonth = new Date(bigCalYear, bigCalMonth, 0).getDate();
  const today = new Date();

  for (let i=0; i<firstDay; i++) {
    const cell = document.createElement("div");
    cell.className = "big-cal-day empty";
    gridEl.appendChild(cell);
  }
  for (let d=1; d<=daysInMonth; d++) {
    const cell = document.createElement("div");
    const isToday = today.getFullYear()===bigCalYear && today.getMonth()+1===bigCalMonth && today.getDate()===d;
    const shows = byDate[d] || [];
    cell.className = "big-cal-day" + (shows.length ? " has" : "") + (isToday ? " today" : "");
    cell.innerHTML = `<div class="big-day-num">${d}</div>`;
    shows.forEach(r => {
      const dot = document.createElement("div");
      dot.className = "big-cal-dot";
      dot.textContent = r.title;
      cell.appendChild(dot);
    });
    if (shows.length) {
      cell.onclick = () => showCalDetail(d, shows);
    }
    gridEl.appendChild(cell);
  }
}

function showCalDetail(day, shows) {
  const el = document.getElementById("calDetail");
  el.innerHTML = `<div class="cal-detail-title">${bigCalYear}년 ${bigCalMonth}월 ${day}일</div>
    <div class="list-wrap">${shows.map(r => `
      <div class="list-row" onclick='openModal(${JSON.stringify(r)})'>
        <div class="list-icon">🎭</div>
        <div class="list-main">
          <div class="list-name">${r.title}</div>
          <div class="list-sub">${r.venue || "—"}</div>
        </div>
        <div class="list-score">${starLabel(r.rating)}</div>
      </div>`).join("")}
    </div>`;
}

// ──────────────────────────────────────────
// 📋 전체 목록
// ──────────────────────────────────────────
function renderFullList(reviews) {
  const el = document.getElementById("fullList");
  el.innerHTML = "";
  const sorted = [...reviews].sort((a,b) => b.date.localeCompare(a.date));
  if (!sorted.length) { el.innerHTML = `<div class="empty-state">표시할 관극 기록이 없어요</div>`; return; }

  sorted.forEach(r => {
    const row = document.createElement("div");
    row.className = "full-list-row";
    row.onclick = () => openModal(r);
    const thumb = r.driveImg ? driveThumb(r.driveImg, 80) : null;
    row.innerHTML = `
      <div class="full-list-img">${thumb ? `<img src="${thumb}" loading="lazy">` : "🎭"}</div>
      <div class="full-list-main">
        <div class="full-list-name">${r.title}</div>
        <div class="full-list-sub">${r.venue || "—"}</div>
      </div>
      <div class="full-list-right">
        <div class="full-list-score">${renderStars(r.rating)}</div>
        <div class="full-list-date">${r.date}</div>
      </div>`;
    el.appendChild(row);
  });
}

function initFilters() {
  const years = [...new Set(allReviews.map(r => r.date.split("-")[0]).filter(Boolean))].sort().reverse();
  const sel = document.getElementById("yearFilter");
  years.forEach(y => {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y + "년";
    sel.appendChild(opt);
  });

function applyFilter() {
  const y = document.getElementById("yearFilter").value;
  const r = document.getElementById("ratingFilter").value;
  const keyword = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  let filtered = [...allReviews];
  if (y) filtered = filtered.filter(rv => rv.date.startsWith(y));
  if (r) filtered = filtered.filter(rv => rv.rating >= parseFloat(r) && rv.rating < parseFloat(r)+1);
  if (keyword) filtered = filtered.filter(rv =>
    rv.title.toLowerCase().includes(keyword) ||
    rv.review.toLowerCase().includes(keyword)
  );
  renderFullList(filtered);
}
  document.getElementById("yearFilter").onchange = applyFilter;
  document.getElementById("ratingFilter").onchange = applyFilter;
     document.getElementById("searchInput").addEventListener("input", function() {
    const keyword = this.value.trim().toLowerCase();
    const y = document.getElementById("yearFilter").value;
    const r = document.getElementById("ratingFilter").value;
    let filtered = [...allReviews];
    if (y) filtered = filtered.filter(rv => rv.date.startsWith(y));
    if (r) filtered = filtered.filter(rv => rv.rating >= parseFloat(r) && rv.rating < parseFloat(r)+1);
    if (keyword) filtered = filtered.filter(rv =>
      rv.title.toLowerCase().includes(keyword) ||
      rv.review.toLowerCase().includes(keyword)
    );
    renderFullList(filtered);
  });
}

// ──────────────────────────────────────────
// 📊 통계 차트
// ──────────────────────────────────────────
function renderBarChart(containerId, data, useGold = false) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  const max = Math.max(...data.map(d => d.value), 1);
  data.forEach(d => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label">${d.label}</div>
      <div class="bar-track"><div class="bar-fill${useGold?" gold":""}" style="width:${Math.round(d.value/max*100)}%"></div></div>
      <div class="bar-count">${d.value}</div>`;
    el.appendChild(row);
  });
}

function renderStats(reviews) {
  // 연도별
  const byYear = {};
  reviews.forEach(r => {
    const y = r.date.split("-")[0];
    if (y) byYear[y] = (byYear[y]||0) + 1;
  });
  renderBarChart("yearChart", Object.entries(byYear).sort().reverse().map(([k,v]) => ({label:k, value:v})));

  // 월별 (올해)
  const thisYear = new Date().getFullYear().toString();
  const byMonth = Array.from({length:12}, (_,i) => ({label:`${i+1}월`, value:0}));
  reviews.filter(r => r.date.startsWith(thisYear)).forEach(r => {
    const m = parseInt(r.date.split("-")[1]) - 1;
    if (m>=0 && m<12) byMonth[m].value++;
  });
  renderBarChart("monthChart", byMonth);

  // 별점 분포
  const byRating = {5:0, 4:0, 3:0, 2:0, 1:0};
  reviews.filter(r=>r.rating>0).forEach(r => {
    const k = Math.round(r.rating);
    if (byRating[k] !== undefined) byRating[k]++;
  });
  renderBarChart("ratingChart", Object.entries(byRating).reverse().map(([k,v])=>({label:"★".repeat(parseInt(k)), value:v})), true);
}

// ──────────────────────────────────────────
// 🪟 모달
// ──────────────────────────────────────────
function openModal(r) {
  const overlay = document.getElementById("modalOverlay");
  const imgEl   = document.getElementById("modalImg");
  const thumb   = r.driveImg ? driveThumb(r.driveImg, 600) : null;

  imgEl.innerHTML = thumb
    ? `<img src="${thumb}" alt="${r.title}">`
    : "🎭";

  document.getElementById("modalTitle").textContent  = r.title;
  document.getElementById("modalMeta").textContent   = `${r.date}${r.venue ? " · " + r.venue : ""}`;
  document.getElementById("modalStars").textContent  = renderStars(r.rating) + `  ${starLabel(r.rating)}`;
  document.getElementById("modalReview").textContent = r.review || "(후기 없음)";

  overlay.classList.add("open");
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
}

// ──────────────────────────────────────────
// 🔀 탭 전환
// ──────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-link, .mobile-link").forEach(el => el.classList.remove("active"));

  document.getElementById(`tab-${tabName}`)?.classList.add("active");
  document.querySelectorAll(`[data-tab="${tabName}"]`).forEach(el => el.classList.add("active"));

  document.getElementById("mobileMenu").classList.remove("open");
}

// ──────────────────────────────────────────
// 🚀 초기화
// ──────────────────────────────────────────
async function init() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth() + 1;
  bigCalYear = calYear;
  bigCalMonth = calMonth;

  // 탭 이벤트
  document.querySelectorAll("[data-tab]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      switchTab(el.dataset.tab);
    });
  });

  // 더보기 버튼
  document.querySelectorAll("[data-goto]").forEach(el => {
    el.addEventListener("click", () => switchTab(el.dataset.goto));
  });

  // 모달 닫기
  document.getElementById("modalClose").onclick = closeModal;
  document.getElementById("modalOverlay").onclick = e => {
    if (e.target === e.currentTarget) closeModal();
  };

  // 햄버거 메뉴
  document.getElementById("menuBtn").onclick = () => {
    document.getElementById("mobileMenu").classList.toggle("open");
  };

  // 미니 달력 네비
  document.getElementById("calPrev").onclick = () => {
    calMonth--; if (calMonth<1) { calMonth=12; calYear--; }
    renderMiniCal(allReviews);
  };
  document.getElementById("calNext").onclick = () => {
    calMonth++; if (calMonth>12) { calMonth=1; calYear++; }
    renderMiniCal(allReviews);
  };

  // 큰 달력 네비
  document.getElementById("bigCalPrev").onclick = () => {
    bigCalMonth--; if (bigCalMonth<1) { bigCalMonth=12; bigCalYear--; }
    renderBigCal(allReviews);
    document.getElementById("calDetail").innerHTML = "";
  };
  document.getElementById("bigCalNext").onclick = () => {
    bigCalMonth++; if (bigCalMonth>12) { bigCalMonth=1; bigCalYear++; }
    renderBigCal(allReviews);
    document.getElementById("calDetail").innerHTML = "";
  };

  // 데이터 로드
  try {
    allReviews = await loadData();
  } catch (err) {
    console.error("데이터 로드 실패 — Mock 데이터로 대체:", err);
    allReviews = MOCK_REVIEWS;
  }

  // 렌더링
  const stats = calcStats(allReviews);
  updateStatBar(stats);
  renderRecentCards(allReviews);
  renderTopRated(allReviews);
  renderMiniCal(allReviews);
  renderBigCal(allReviews);
  renderVenueTags(allReviews);
  renderFullList(allReviews);
  initFilters();
  renderStats(allReviews);
}

document.addEventListener("DOMContentLoaded", init);

// 전역 노출 (인라인 onclick용)
window.openModal = openModal;
