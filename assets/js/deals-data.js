/* 핫딜 레이더 — 사람이 직접 고른 딜 목록 (자동 크롤링 금지).
   운영: 매주 월·목 이 파일을 고쳐 6–12개만 둔다. 품절·종료된 딜은 바로 지운다.
   expires 가 지난 딜은 화면에서 자동으로 빠진다(방치된 딜 방지).
   주의: 목업 예시 데이터 — 가격은 실제 판매가가 아니다. 링크는 각 쇼핑몰 검색 결과로 연결된다. */
window.GB_DEALS = {
  updated: '2026-09-28',
  nextUpdate: '2026-10-01',
  cadence: '매주 월·목 업데이트',
  affiliate: false,
  deals: [
    { id: 'd01', shop: 'Nike', title: 'Pegasus 41 러닝화', item: 'Nike Pegasus 41 Running Shoes', price: 89.97, was: 140, lb: 3, cat: '신발', center: 'NJ',
      url: 'https://www.nike.com/w?q=pegasus%2041', expires: '2026-10-05' },
    { id: 'd02', shop: 'Amazon', title: 'Anker 보조배터리 20000mAh', item: 'Anker Power Bank 20000mAh', price: 29.99, was: 49.99, lb: 1, cat: '전자기기', center: 'DE',
      url: 'https://www.amazon.com/s?k=anker+power+bank+20000mah', expires: '2026-10-02', note: '리튬 배터리 · 항공 규정상 1개까지' },
    { id: 'd03', shop: 'iHerb', title: 'Now Foods 비타민 D3 5000IU', item: 'Now Foods Vitamin D3 5000 IU', price: 11.49, was: 18.99, lb: 1, cat: '건강기능식품', center: 'NJ',
      url: 'https://www.iherb.com/search?kw=now%20foods%20d3%205000', expires: '2026-10-08', note: '건강기능식품 · $150 기준 · 6병 이하' },
    { id: 'd04', shop: 'Patagonia', title: 'Better Sweater 플리스 재킷', item: 'Patagonia Better Sweater Fleece Jacket', price: 89.99, was: 149, lb: 2, cat: '의류', center: 'NJ',
      url: 'https://www.patagonia.com/search/?q=better%20sweater', expires: '2026-10-04' },
    { id: 'd05', shop: 'Best Buy', title: 'Sony WH-1000XM5 헤드폰', item: 'Sony WH-1000XM5 Wireless Headphones', price: 279.99, was: 399.99, lb: 3, cat: '전자기기', center: 'DE',
      url: 'https://www.bestbuy.com/site/searchpage.jsp?st=sony+wh-1000xm5', expires: '2026-10-01', note: '$200 초과 · 관부가세 대상' },
    { id: 'd06', shop: 'Target', title: 'LEGO Technic 42151', item: 'LEGO Technic 42151', price: 31.99, was: 49.99, lb: 2, cat: '완구·유아', center: 'NJ',
      url: 'https://www.target.com/s?searchTerm=lego+technic+42151', expires: '2026-10-06' },
    { id: 'd07', shop: 'Sephora', title: '데일리 스킨케어 세트', item: 'Skincare Value Set', price: 42, was: 68, lb: 2, cat: '화장품', center: 'NJ',
      url: 'https://www.sephora.com/search?keyword=skincare%20value%20set', expires: '2026-10-05' },
    { id: 'd08', shop: 'J.Crew', title: '캐시미어 크루넥 니트', item: 'J.Crew Cashmere Crewneck Sweater', price: 98, was: 168, lb: 2, cat: '의류', center: 'NJ',
      url: 'https://www.jcrew.com/search2/index.jsp?q=cashmere%20crewneck', expires: '2026-10-07' },
  ],
};
