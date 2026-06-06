// scripts/export-notion.js
// GitHub Actions에서 실행 — 노션 전체 데이터를 data.json으로 저장

const fs = require("fs");

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const REVIEW_DB_ID = process.env.REVIEW_DB_ID;

if (!NOTION_TOKEN || !REVIEW_DB_ID) {
  console.error("❌ 환경변수 NOTION_TOKEN, REVIEW_DB_ID 가 필요합니다.");
  process.exit(1);
}

// 날짜 정규화
function normalizeDate(raw) {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (isNaN(d)) return raw;
  return d.toISOString().slice(0, 10);
}

// 별점 파싱
function parseRating(p) {
  if (!p) return 0;
  if (typeof p.number === "number") return p.number;
  if (p.rollup?.number !== undefined) return p.rollup.number;
  if (p.rollup?.array?.[0]?.number !== undefined) return p.rollup.array[0].number;
  return 0;
}

// 노션 페이지 파싱
function parsePage(page) {
  const props = page.properties;
  return {
    id: page.id,
    title: props["공연명"]?.title?.[0]?.plain_text || "(제목 없음)",
    date: normalizeDate(props["날짜"]?.date?.start || ""),
    venue: props["공연장"]?.rich_text?.[0]?.plain_text || "",
    rating: parseRating(props["별점"]),
    review: props["후기"]?.rich_text?.[0]?.plain_text || "",
    driveImg: props["사진"]?.url || null,
  };
}

// 노션 DB 전체 페이지네이션
async function fetchAll(dbId) {
  const results = [];
  let cursor = undefined;
  let page = 1;

  while (true) {
    console.log(`  📄 페이지 ${page} 로딩 중...`);
    const body = {
      page_size: 100,
      sorts: [{ property: "날짜", direction: "descending" }],
    };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion API 오류 ${res.status}: ${err}`);
    }

    const data = await res.json();
    results.push(...data.results.map(parsePage));
    console.log(`  ✅ ${results.length}건 수집됨`);

    if (!data.has_more) break;
    cursor = data.next_cursor;
    page++;

    // API 과부하 방지
    await new Promise(r => setTimeout(r, 300));
  }

  return results;
}

async function main() {
  console.log("🎭 노션 데이터 export 시작...");

  const reviews = await fetchAll(REVIEW_DB_ID);

  const output = {
    updatedAt: new Date().toISOString(),
    total: reviews.length,
    reviews,
  };

  fs.writeFileSync("data.json", JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n✅ 완료! 총 ${reviews.length}건 → data.json 저장됨`);
}

main().catch(err => {
  console.error("❌ 오류:", err);
  process.exit(1);
});
