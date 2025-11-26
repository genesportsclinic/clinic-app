import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import dayjs, { Dayjs } from "dayjs";
import "./App.css";
import { supabase } from "./supabaseClient";
import logo from "/더바름진 고화질.png";

// ----------------------
// 타입 정의
// ----------------------

type ItemType = "운동 검사" | "PT" | "상품";

type DiscountKey = "할인 없음" | "10%" | "20%" | "30%";

type PaymentMethod = "카드" | "현금" | "계좌 이체";

interface Staff {
  id: string;
  name: string;
  role: "팀장" | "일반";
  created_at?: string;
}

interface Sale {
  id: string;
  date: string; // YYYY-MM-DD
  itemType: ItemType;
  product: string;
  staffId: string | null;
  staffRole: "팀장" | "일반" | null;
  discountKey: DiscountKey;
  paymentMethod: PaymentMethod;
  basePrice: number;
  finalPrice: number;
  created_at?: string;
}

interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  storeName: string;
  last4: string;
  amount: number;
  created_at?: string;
}

interface Product {
  id: string;
  category: ItemType;
  name: string;
  price_base: number;
  price_team: number | null;
  price_normal: number | null;
  is_group: boolean;
  created_at?: string;
}

type TabName =
  | "직원 관리"
  | "상품 관리"
  | "일일 매출 입력"
  | "일일 지출 입력"
  | "누적 손익 현황";

// ----------------------
// 유틸
// ----------------------

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function formatDate(d: Dayjs | string): string {
  const dd = typeof d === "string" ? dayjs(d) : d;
  return dd.format("YYYY-MM-DD");
}

function inRange(date: string, from: string, to: string) {
  const d = dayjs(date);
  const fromD = dayjs(from);
  const toD = dayjs(to);
  if (!d.isValid() || !fromD.isValid() || !toD.isValid()) return false;
  return !d.isBefore(fromD, "day") && !d.isAfter(toD, "day");
}

// 템플릿 기준 기본 운동 검사 / 상품 이름
const DEFAULT_EXAM_PRODUCTS = [
  "종합검사",
  "기본검사",
  "3D동작분석",
  "메디컬테스트",
  "운동부하검사",
  "등속성 + 윈게이트",
  "등속성 근 기능검사",
  "윈게이트",
  "중력조절보행검사",
  "중력조절보행재활",
  "재활운동 프로그램",
];

const DEFAULT_ITEM_PRODUCTS = [
  "젠톡유전자키트",
  "프로틴음료",
  "게토레이",
  "체험권",
];

const ADMIN_CODE = "9577";

// ----------------------
// 메인 컴포넌트
// ----------------------

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabName>("직원 관리");
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminInput, setAdminInput] = useState("");

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"팀장" | "일반">("팀장");

  const [products, setProducts] = useState<Product[]>([]);
  const [productNew, setProductNew] = useState<{
    category: ItemType;
    name: string;
    priceBase: string;
    priceTeam: string;
    priceNormal: string;
    isGroup: boolean;
  }>({
    category: "운동 검사",
    name: "",
    priceBase: "",
    priceTeam: "",
    priceNormal: "",
    isGroup: false,
  });

  const [sales, setSales] = useState<Sale[]>([]);
  const [salesDateMode, setSalesDateMode] = useState<"선택 날짜" | "기간">(
    "선택 날짜"
  );
  const [salesDate, setSalesDate] = useState(formatDate(dayjs()));
  const [salesFrom, setSalesFrom] = useState(formatDate(dayjs()));
  const [salesTo, setSalesTo] = useState(formatDate(dayjs()));

  const [salesForm, setSalesForm] = useState<{
    date: string;
    itemType: ItemType | "";
    product: string;
    staffId: string;
    discountKey: DiscountKey;
    paymentMethod: PaymentMethod;
  }>({
    date: formatDate(dayjs()),
    itemType: "",
    product: "",
    staffId: "",
    discountKey: "할인 없음",
    paymentMethod: "카드",
  });

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseDateMode, setExpenseDateMode] = useState<"선택 날짜" | "기간">(
    "선택 날짜"
  );
  const [expenseDate, setExpenseDate] = useState(formatDate(dayjs()));
  const [expenseFrom, setExpenseFrom] = useState(formatDate(dayjs()));
  const [expenseTo, setExpenseTo] = useState(formatDate(dayjs()));

  const [summaryMonth, setSummaryMonth] = useState<string>(
    dayjs().format("YYYY-MM")
  );
  const [summaryYear, setSummaryYear] = useState<string>(
    dayjs().format("YYYY")
  );

  // ----------------------
  // Supabase 로딩
  // ----------------------

  useEffect(() => {
    loadStaff();
    loadProducts();
    loadSales();
    loadExpenses();
  }, []);

  async function loadStaff() {
    const { data, error } = await supabase
      .from("staff")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("직원 목록 로드 오류", error);
      return;
    }
    setStaffList(data as Staff[]);
  }

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      console.error("상품 목록 로드 오류", error);
      return;
    }
    setProducts(data as Product[]);
  }

  async function loadSales() {
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .order("date", { ascending: true });
    if (error) {
      console.error("매출 데이터 로드 오류", error);
      return;
    }
    setSales(data as Sale[]);
  }

  async function loadExpenses() {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("date", { ascending: true });
    if (error) {
      console.error("지출 데이터 로드 오류", error);
      return;
    }
    setExpenses(data as Expense[]);
  }

  // ----------------------
  // 관리자 모드
  // ----------------------

  function handleAdminCheck() {
    if (adminInput.trim() === ADMIN_CODE) {
      setIsAdminMode(true);
      alert("관리자 모드로 전환되었습니다.");
    } else {
      setIsAdminMode(false);
      alert("관리자 번호가 올바르지 않습니다.");
    }
  }

  // ----------------------
  // 직원 관리
  // ----------------------

  async function handleAddStaff() {
    if (!isAdminMode) {
      alert("관리자 모드에서만 추가 가능합니다.");
      return;
    }
    if (!newStaffName.trim()) {
      alert("이름을 입력하세요.");
      return;
    }
    const id = uuid();
    const { error } = await supabase.from("staff").insert({
      id,
      name: newStaffName.trim(),
      role: newStaffRole,
    });
    if (error) {
      console.error("직원 추가 오류", error);
      alert("직원 추가 중 오류가 발생했습니다.");
      return;
    }
    setNewStaffName("");
    await loadStaff();
  }

  async function handleDeleteStaff(id: string) {
    if (!isAdminMode) {
      alert("관리자 모드에서만 삭제 가능합니다.");
      return;
    }
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("staff").delete().eq("id", id);
    if (error) {
      console.error("직원 삭제 오류", error);
      alert("직원 삭제 중 오류가 발생했습니다.");
      return;
    }
    await loadStaff();
  }

  // ----------------------
  // 상품 관리
  // ----------------------

  async function handleAddProduct() {
    if (!isAdminMode) {
      alert("관리자 모드에서만 추가 가능합니다.");
      return;
    }
    if (!productNew.name.trim()) {
      alert("상품명을 입력하세요.");
      return;
    }
    if (!productNew.priceBase) {
      alert("기본 가격을 입력하세요.");
      return;
    }
    const id = uuid();
    const { error } = await supabase.from("products").insert({
      id,
      category: productNew.category,
      name: productNew.name.trim(),
      price_base: Number(productNew.priceBase),
      price_team: productNew.priceTeam
        ? Number(productNew.priceTeam)
        : null,
      price_normal: productNew.priceNormal
        ? Number(productNew.priceNormal)
        : null,
      is_group: productNew.isGroup,
    });
    if (error) {
      console.error("상품 추가 오류", error);
      alert("상품 추가 중 오류가 발생했습니다.");
      return;
    }
    setProductNew({
      category: "운동 검사",
      name: "",
      priceBase: "",
      priceTeam: "",
      priceNormal: "",
      isGroup: false,
    });
    await loadProducts();
  }

  async function handleDeleteProduct(id: string) {
    if (!isAdminMode) {
      alert("관리자 모드에서만 삭제 가능합니다.");
      return;
    }
    if (!window.confirm("상품을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      console.error("상품 삭제 오류", error);
      alert("상품 삭제 중 오류가 발생했습니다.");
      return;
    }
    await loadProducts();
  }

  async function handleUpdateProductPrice(
    id: string,
    field: "price_base" | "price_team" | "price_normal",
    value: number
  ) {
    if (!isAdminMode) {
      alert("관리자 모드에서만 수정 가능합니다.");
      return;
    }
    const { error } = await supabase
      .from("products")
      .update({ [field]: value })
      .eq("id", id);
    if (error) {
      console.error("상품 가격 수정 오류", error);
      alert("가격 수정 중 오류가 발생했습니다.");
      return;
    }
    await loadProducts();
  }

  // ----------------------
  // 가격 계산
  // ----------------------

  function getPriceFromProducts(
    itemType: ItemType,
    productName: string,
    staffRole: "팀장" | "일반" | null
  ): number | null {
    const p = products.find(
      (x) => x.category === itemType && x.name === productName
    );
    if (!p) return null;
    if (itemType === "PT") {
      if (p.is_group) return p.price_base;
      if (staffRole === "팀장" && p.price_team != null) return p.price_team;
      if (staffRole === "일반" && p.price_normal != null)
        return p.price_normal;
      return p.price_base;
    }
    return p.price_base;
  }

  function getLegacyPrice(
    itemType: ItemType,
    productName: string
  ): number {
    console.warn("가격 테이블에 없는 상품입니다:", itemType, productName);
    return 0;
  }

  function getUnitPrice(
    itemType: ItemType,
    productName: string,
    staffRole: "팀장" | "일반" | null
  ): number {
    const fromDb = getPriceFromProducts(itemType, productName, staffRole);
    if (fromDb != null) return fromDb;
    return getLegacyPrice(itemType, productName);
  }

  function applyDiscount(amount: number, discount: DiscountKey): number {
    if (discount === "10%") return Math.round(amount * 0.9);
    if (discount === "20%") return Math.round(amount * 0.8);
    if (discount === "30%") return Math.round(amount * 0.7);
    return amount;
  }

  // ----------------------
  // 매출 입력
  // ----------------------

  const selectableProductsForSales = useMemo(() => {
    const itemType = salesForm.itemType;
    if (!itemType) return [] as string[];

    const fromDb = products
      .filter((p) => p.category === itemType)
      .map((p) => p.name);

    if (itemType === "운동 검사") {
      const merged = Array.from(
        new Set([...DEFAULT_EXAM_PRODUCTS, ...fromDb])
      );
      return merged;
    }
    if (itemType === "상품") {
      const merged = Array.from(
        new Set([...DEFAULT_ITEM_PRODUCTS, ...fromDb])
      );
      return merged;
    }
    // PT
    return fromDb;
  }, [salesForm.itemType, products]);

  async function handleAddSale() {
    if (!isAdminMode) {
      alert("관리자 모드에서만 입력 가능합니다.");
      return;
    }
    const { date, itemType, product, staffId, discountKey, paymentMethod } =
      salesForm;
    if (!date || !itemType || !product) {
      alert("날짜, 품목, 상품을 모두 선택하세요.");
      return;
    }
    let staffRole: "팀장" | "일반" | null = null;
    if (staffId) {
      const s = staffList.find((x) => x.id === staffId);
      staffRole = s?.role ?? null;
    }

    const basePrice = getUnitPrice(itemType, product, staffRole);
    const finalPrice = applyDiscount(basePrice, discountKey);

    const newId = uuid();
    const { error } = await supabase.from("sales").insert({
      id: newId,
      date,
      itemType,
      product,
      staffId: staffId || null,
      staffRole,
      discountKey,
      paymentMethod,
      basePrice,
      finalPrice,
    });
    if (error) {
      console.error("매출 추가 오류", error);
      alert("매출 추가 중 오류가 발생했습니다.");
      return;
    }
    await loadSales();
  }

  const filteredSales = useMemo(() => {
    if (salesDateMode === "선택 날짜") {
      return sales.filter((s) => s.date === salesDate);
    }
    return sales.filter((s) => inRange(s.date, salesFrom, salesTo));
  }, [sales, salesDateMode, salesDate, salesFrom, salesTo]);

  const dailySalesTotal = useMemo(
    () => filteredSales.reduce((sum, s) => sum + s.finalPrice, 0),
    [filteredSales]
  );

  // ----------------------
  // 지출 업로드 / 필터
  // ----------------------

  async function handleExpenseFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isAdminMode) {
      alert("관리자 모드에서만 업로드 가능합니다.");
      return;
    }
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
    });

    const newExpenses: Expense[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 6) continue;
      const rawDate = String(row[0] || "").trim();
      const contentC = String(row[2] || "").trim();
      const contentD = String(row[3] || "").trim();
      const amountStr = String(row[5] || "").replace(/[^0-9-]/g, "");
      if (!rawDate || !amountStr) continue;

      const d = dayjs(rawDate);
      if (!d.isValid()) continue;
      const date = d.format("YYYY-MM-DD");

      const last4 = contentC.slice(-4).replace(/[^0-9]/g, "");
      const storeName = contentD;
      const amount = Number(amountStr);

      newExpenses.push({
        id: uuid(),
        date,
        storeName,
        last4,
        amount,
      });
    }

    if (newExpenses.length === 0) {
      alert("가져올 지출 데이터가 없습니다.");
      return;
    }

    const { error } = await supabase.from("expenses").insert(newExpenses);
    if (error) {
      console.error("지출 저장 오류", error);
      alert("지출 업로드 중 오류가 발생했습니다.");
      return;
    }

    await loadExpenses();
    alert("지출 데이터가 저장되었습니다.");
  }

  const filteredExpenses = useMemo(() => {
    if (expenseDateMode === "선택 날짜") {
      return expenses.filter((e) => e.date === expenseDate);
    }
    return expenses.filter((e) => inRange(e.date, expenseFrom, expenseTo));
  }, [expenses, expenseDateMode, expenseDate, expenseFrom, expenseTo]);

  const dailyExpenseTotal = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );

  const expenseTotalByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) {
      map[e.date] = (map[e.date] || 0) + e.amount;
    }
    return Object.entries(map)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, total]) => ({ date, total }));
  }, [expenses]);

  // ----------------------
  // 손익 현황 (월 / 연간)
  // ----------------------

  const monthlySummary = useMemo(() => {
    const [year, month] = summaryMonth.split("-");
    if (!year || !month) return { sales: 0, expenses: 0, profit: 0 };

    const monthSales = sales.filter((s) =>
      s.date.startsWith(`${year}-${month}`)
    );
    const monthExpenses = expenses.filter((e) =>
      e.date.startsWith(`${year}-${month}`)
    );

    const sTotal = monthSales.reduce((sum, s) => sum + s.finalPrice, 0);
    const eTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
    return { sales: sTotal, expenses: eTotal, profit: sTotal - eTotal };
  }, [summaryMonth, sales, expenses]);

  const yearlySummary = useMemo(() => {
    const y = summaryYear;
    if (!y)
      return [] as {
        month: string;
        sales: number;
        expenses: number;
        profit: number;
      }[];

    const result: {
      month: string;
      sales: number;
      expenses: number;
      profit: number;
    }[] = [];
    for (let m = 1; m <= 12; m++) {
      const mm = m.toString().padStart(2, "0");
      const prefix = `${y}-${mm}`;
      const monthSales = sales.filter((s) => s.date.startsWith(prefix));
      const monthExpenses = expenses.filter((e) =>
        e.date.startsWith(prefix)
      );
      const sTotal = monthSales.reduce((sum, s) => sum + s.finalPrice, 0);
      const eTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
      result.push({
        month: `${y}-${mm}`,
        sales: sTotal,
        expenses: eTotal,
        profit: sTotal - eTotal,
      });
    }
    return result;
  }, [summaryYear, sales, expenses]);

  // ----------------------
  // 일일 통계 엑셀 다운로드 (템플릿 유지)
  // ----------------------

  async function handleDownloadDailyExcel() {
    if (!isAdminMode) {
      alert("관리자 모드에서만 엑셀 다운로드가 가능합니다.");
      return;
    }

    if (!filteredSales.length) {
      alert("선택된 범위에 매출 데이터가 없습니다.");
      return;
    }
    const targetDate =
      salesDateMode === "선택 날짜" ? salesDate : salesFrom;

    const examCounts: Record<string, number> = {};
    const examTotals: Record<string, number> = {};
    const itemCounts: Record<string, number> = {};
    const itemTotals: Record<string, number> = {};

    for (const s of sales) {
      if (s.date !== targetDate) continue;
      if (s.itemType === "운동 검사") {
        examCounts[s.product] = (examCounts[s.product] || 0) + 1;
        examTotals[s.product] =
          (examTotals[s.product] || 0) + s.finalPrice;
      } else if (s.itemType === "상품") {
        itemCounts[s.product] = (itemCounts[s.product] || 0) + 1;
        itemTotals[s.product] =
          (itemTotals[s.product] || 0) + s.finalPrice;
      }
    }

    await downloadDailyExcelWithTemplate(targetDate, {
      examCounts,
      examTotals,
      productCounts: itemCounts,
      productTotals: itemTotals,
    });
  }

  async function downloadDailyExcelWithTemplate(
    dateStr: string,
    stats: {
      examCounts: Record<string, number>;
      examTotals: Record<string, number>;
      productCounts: Record<string, number>;
      productTotals: Record<string, number>;
    }
  ) {
    const res = await fetch("/daily-template.xlsx");
    if (!res.ok) {
      alert(
        "엑셀 템플릿을 불러오지 못했습니다. daily-template.xlsx 위치를 확인하세요."
      );
      return;
    }
    const arrayBuffer = await res.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: "array", cellStyles: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const displayDate = dayjs(dateStr).format("YYYY.MM.DD(ddd)");
    const dateCell = "R30";
    ws[dateCell] = { ...(ws[dateCell] || {}), v: displayDate };

    const examRowMap: Record<string, number> = {
      종합검사: 7,
      기본검사: 8,
      "3D동작분석": 9,
      메디컬테스트: 10,
      운동부하검사: 11,
      "등속성 + 윈게이트": 12,
      "등속성 근 기능검사": 13,
      윈게이트: 14,
      중력조절보행검사: 15,
      중력조절보행재활: 16,
      재활운동 프로그램: 17,
    };

    let examTotalCount = 0;
    let examTotalAmount = 0;

    Object.entries(examRowMap).forEach(([name, row]) => {
      const count = stats.examCounts[name] ?? 0;
      const total = stats.examTotals[name] ?? 0;
      const countCell = `D${row}`;
      const sumCell = `E${row}`;
      if (count !== 0 || ws[countCell]) {
        ws[countCell] = { ...(ws[countCell] || {}), v: count };
      }
      if (total !== 0 || ws[sumCell]) {
        ws[sumCell] = { ...(ws[sumCell] || {}), v: total };
      }
      examTotalCount += count;
      examTotalAmount += total;
    });

    ws["D18"] = { ...(ws["D18"] || {}), v: examTotalCount };
    ws["E18"] = { ...(ws["E18"] || {}), v: examTotalAmount };

    const productRowMap: Record<string, number> = {
      젠톡유전자키트: 22,
      프로틴음료: 23,
      게토레이: 24,
      체험권: 25,
    };

    let prodTotalAmount = 0;

    Object.entries(productRowMap).forEach(([name, row]) => {
      const count = stats.productCounts[name] ?? 0;
      const total = stats.productTotals[name] ?? 0;
      const countCell = `D${row}`;
      const sumCell = `E${row}`;
      if (count !== 0 || ws[countCell]) {
        ws[countCell] = { ...(ws[countCell] || {}), v: count };
      }
      if (total !== 0 || ws[sumCell]) {
        ws[sumCell] = { ...(ws[sumCell] || {}), v: total };
      }
      prodTotalAmount += total;
    });

    ws["E26"] = { ...(ws["E26"] || {}), v: prodTotalAmount };

    const fileName = `일일통계_${dateStr}.xlsx`;
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ----------------------
  // 렌더링
  // ----------------------

  return (
    <div className="app-root">
      <div className="app-shell">
        {/* 헤더 */}
        <header className="app-header">
          <div className="header-left">
            <img src={logo} className="logo-img" alt="GENE SPORTS CLINIC" />
            <div className="header-text">
              <div className="header-title">더바름 진 SPORTS CLINIC</div>
              <div className="header-subtitle">매출 · 지출 관리 대시보드</div>
            </div>
          </div>
          <div className="header-right">
            <div className="mode-label">
              현재 모드:{" "}
              <span className={isAdminMode ? "mode-admin" : "mode-view"}>
                {isAdminMode ? "관리자" : "조회 전용"}
              </span>
            </div>
            <div className="admin-box">
              <input
                type="password"
                placeholder="관리자 번호"
                value={adminInput}
                onChange={(e) => setAdminInput(e.target.value)}
              />
              <button onClick={handleAdminCheck}>확인</button>
            </div>
          </div>
        </header>

        {/* 탭 내비게이션 */}
        <nav className="tab-nav">
          {(["직원 관리", "상품 관리", "일일 매출 입력", "일일 지출 입력", "누적 손익 현황"] as TabName[]).map(
            (tab) => (
              <button
                key={tab}
                className={"tab-btn" + (activeTab === tab ? " active" : "")}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            )
          )}
        </nav>

        {/* 탭 컨텐츠 */}
        <main className="tab-content">
          {/* 직원 관리 */}
          {activeTab === "직원 관리" && (
            <div className="card">
              <h2>직원 관리</h2>
              <div className="card-body">
                <div className="form-row">
                  <div className="form-field">
                    <label>이름</label>
                    <input
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      disabled={!isAdminMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>직급</label>
                    <select
                      value={newStaffRole}
                      onChange={(e) =>
                        setNewStaffRole(e.target.value as "팀장" | "일반")
                      }
                      disabled={!isAdminMode}
                    >
                      <option value="팀장">팀장</option>
                      <option value="일반">일반</option>
                    </select>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handleAddStaff}
                    disabled={!isAdminMode}
                  >
                    직원 추가
                  </button>
                </div>
                <table className="data-table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>직급</th>
                      <th>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.length === 0 && (
                      <tr>
                        <td colSpan={3} className="table-empty">
                          등록된 직원이 없습니다.
                        </td>
                      </tr>
                    )}
                    {staffList.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.role}</td>
                        <td>
                          <button
                            className="btn-small btn-danger"
                            onClick={() => handleDeleteStaff(s.id)}
                            disabled={!isAdminMode}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 상품 관리 */}
          {activeTab === "상품 관리" && (
            <div className="card">
              <h2>상품 관리</h2>
              <div className="card-body">
                <div className="grid-4">
                  <div className="form-field">
                    <label>품목</label>
                    <select
                      value={productNew.category}
                      onChange={(e) =>
                        setProductNew((prev) => ({
                          ...prev,
                          category: e.target.value as ItemType,
                        }))
                      }
                      disabled={!isAdminMode}
                    >
                      <option value="운동 검사">운동 검사</option>
                      <option value="PT">PT</option>
                      <option value="상품">상품</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>상품명</label>
                    <input
                      value={productNew.name}
                      onChange={(e) =>
                        setProductNew((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      disabled={!isAdminMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>기본 가격</label>
                    <input
                      type="number"
                      value={productNew.priceBase}
                      onChange={(e) =>
                        setProductNew((prev) => ({
                          ...prev,
                          priceBase: e.target.value,
                        }))
                      }
                      disabled={!isAdminMode}
                    />
                  </div>
                  {productNew.category === "PT" && (
                    <>
                      <div className="form-field">
                        <label>팀장 가격 (개인 PT)</label>
                        <input
                          type="number"
                          value={productNew.priceTeam}
                          onChange={(e) =>
                            setProductNew((prev) => ({
                              ...prev,
                              priceTeam: e.target.value,
                            }))
                          }
                          disabled={!isAdminMode}
                        />
                      </div>
                      <div className="form-field">
                        <label>일반 가격 (개인 PT)</label>
                        <input
                          type="number"
                          value={productNew.priceNormal}
                          onChange={(e) =>
                            setProductNew((prev) => ({
                              ...prev,
                              priceNormal: e.target.value,
                            }))
                          }
                          disabled={!isAdminMode}
                        />
                      </div>
                      <div className="form-field">
                        <label>그룹 상품 여부</label>
                        <select
                          value={productNew.isGroup ? "yes" : "no"}
                          onChange={(e) =>
                            setProductNew((prev) => ({
                              ...prev,
                              isGroup: e.target.value === "yes",
                            }))
                          }
                          disabled={!isAdminMode}
                        >
                          <option value="no">개인 PT</option>
                          <option value="yes">그룹 PT</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
                <button
                  className="btn-primary"
                  style={{ marginTop: 10 }}
                  onClick={handleAddProduct}
                  disabled={!isAdminMode}
                >
                  상품 추가
                </button>

                <table className="data-table" style={{ marginTop: 14 }}>
                  <thead>
                    <tr>
                      <th>품목</th>
                      <th>상품명</th>
                      <th>기본 가격</th>
                      <th>팀장 가격 (PT)</th>
                      <th>일반 가격 (PT)</th>
                      <th>그룹 여부</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 && (
                      <tr>
                        <td colSpan={7} className="table-empty">
                          등록된 상품이 없습니다.
                        </td>
                      </tr>
                    )}
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td>{p.category}</td>
                        <td>{p.name}</td>
                        <td>
                          <input
                            type="number"
                            defaultValue={p.price_base}
                            onBlur={(e) =>
                              handleUpdateProductPrice(
                                p.id,
                                "price_base",
                                Number(e.target.value || 0)
                              )
                            }
                            style={{ width: 90 }}
                            disabled={!isAdminMode}
                          />
                        </td>
                        <td>
                          {p.category === "PT" && (
                            <input
                              type="number"
                              defaultValue={p.price_team ?? ""}
                              onBlur={(e) =>
                                handleUpdateProductPrice(
                                  p.id,
                                  "price_team",
                                  Number(e.target.value || 0)
                                )
                              }
                              style={{ width: 90 }}
                              disabled={!isAdminMode}
                            />
                          )}
                        </td>
                        <td>
                          {p.category === "PT" && (
                            <input
                              type="number"
                              defaultValue={p.price_normal ?? ""}
                              onBlur={(e) =>
                                handleUpdateProductPrice(
                                  p.id,
                                  "price_normal",
                                  Number(e.target.value || 0)
                                )
                              }
                              style={{ width: 90 }}
                              disabled={!isAdminMode}
                            />
                          )}
                        </td>
                        <td>
                          {p.category === "PT" && (p.is_group ? "그룹" : "개인")}
                        </td>
                        <td>
                          <button
                            className="btn-small btn-danger"
                            onClick={() => handleDeleteProduct(p.id)}
                            disabled={!isAdminMode}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 일일 매출 입력 */}
          {activeTab === "일일 매출 입력" && (
            <div className="card">
              <h2>일일 매출 입력</h2>
              <div className="card-body">
                <div className="form-row">
                  <div className="form-field">
                    <label>날짜</label>
                    <input
                      type="date"
                      value={salesForm.date}
                      onChange={(e) =>
                        setSalesForm((prev) => ({
                          ...prev,
                          date: e.target.value,
                        }))
                      }
                      disabled={!isAdminMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>품목</label>
                    <select
                      value={salesForm.itemType}
                      onChange={(e) =>
                        setSalesForm((prev) => ({
                          ...prev,
                          itemType: e.target.value as ItemType,
                          product: "",
                        }))
                      }
                      disabled={!isAdminMode}
                    >
                      <option value="">선택</option>
                      <option value="운동 검사">운동 검사</option>
                      <option value="PT">PT</option>
                      <option value="상품">상품</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>상품</label>
                    <select
                      value={salesForm.product}
                      onChange={(e) =>
                        setSalesForm((prev) => ({
                          ...prev,
                          product: e.target.value,
                        }))
                      }
                      disabled={!isAdminMode}
                    >
                      <option value="">선택</option>
                      {selectableProductsForSales.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>담당</label>
                    <select
                      value={salesForm.staffId}
                      onChange={(e) =>
                        setSalesForm((prev) => ({
                          ...prev,
                          staffId: e.target.value,
                        }))
                      }
                      disabled={!isAdminMode}
                    >
                      <option value="">선택</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>할인율</label>
                    <select
                      value={salesForm.discountKey}
                      onChange={(e) =>
                        setSalesForm((prev) => ({
                          ...prev,
                          discountKey: e.target.value as DiscountKey,
                        }))
                      }
                      disabled={!isAdminMode}
                    >
                      <option value="할인 없음">할인 없음</option>
                      <option value="10%">10%</option>
                      <option value="20%">20%</option>
                      <option value="30%">30%</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>결제 방법</label>
                    <select
                      value={salesForm.paymentMethod}
                      onChange={(e) =>
                        setSalesForm((prev) => ({
                          ...prev,
                          paymentMethod: e.target.value as PaymentMethod,
                        }))
                      }
                      disabled={!isAdminMode}
                    >
                      <option value="카드">카드</option>
                      <option value="현금">현금</option>
                      <option value="계좌 이체">계좌 이체</option>
                    </select>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handleAddSale}
                    disabled={!isAdminMode}
                  >
                    매출 추가
                  </button>
                </div>

                <div className="filter-box">
                  <div className="filter-header">
                    <span>매출 내역 보기</span>
                  </div>
                  <div className="filter-row">
                    <label>
                      <input
                        type="radio"
                        checked={salesDateMode === "선택 날짜"}
                        onChange={() => setSalesDateMode("선택 날짜")}
                      />{" "}
                      선택 날짜
                    </label>
                    <input
                      type="date"
                      value={salesDate}
                      onChange={(e) => setSalesDate(e.target.value)}
                    />
                    <label style={{ marginLeft: 16 }}>
                      <input
                        type="radio"
                        checked={salesDateMode === "기간"}
                        onChange={() => setSalesDateMode("기간")}
                      />{" "}
                      기간
                    </label>
                    <input
                      type="date"
                      value={salesFrom}
                      onChange={(e) => setSalesFrom(e.target.value)}
                    />
                    <span>~</span>
                    <input
                      type="date"
                      value={salesTo}
                      onChange={(e) => setSalesTo(e.target.value)}
                    />
                    <button
                      className="btn-primary"
                      style={{ marginLeft: "auto" }}
                      onClick={handleDownloadDailyExcel}
                      disabled={!isAdminMode}
                    >
                      일일 통계 엑셀 다운로드
                    </button>
                  </div>
                </div>

                <table className="data-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>품목</th>
                      <th>상품</th>
                      <th>담당</th>
                      <th>결제 방법</th>
                      <th>할인율</th>
                      <th>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.length === 0 && (
                      <tr>
                        <td colSpan={7} className="table-empty">
                          선택된 범위의 매출 내역이 없습니다.
                        </td>
                      </tr>
                    )}
                    {filteredSales.map((s) => {
                      const staff = s.staffId
                        ? staffList.find((x) => x.id === s.staffId)
                        : undefined;
                      return (
                        <tr key={s.id}>
                          <td>{s.date}</td>
                          <td>{s.itemType}</td>
                          <td>{s.product}</td>
                          <td>{staff ? staff.name : "-"}</td>
                          <td>{s.paymentMethod}</td>
                          <td>{s.discountKey}</td>
                          <td>{s.finalPrice.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={6} style={{ textAlign: "right" }}>
                        합계
                      </th>
                      <th>{dailySalesTotal.toLocaleString()}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* 일일 지출 입력 */}
          {activeTab === "일일 지출 입력" && (
            <div className="card">
              <h2>일일 지출 입력</h2>
              <div className="card-body">
                <div className="form-row">
                  <div className="form-field">
                    <label>승인내역조회 엑셀 업로드</label>
                    <input
                      type="file"
                      accept=".xls,.xlsx"
                      onChange={handleExpenseFileChange}
                      disabled={!isAdminMode}
                    />
                  </div>
                </div>

                <div className="filter-box">
                  <div className="filter-header">
                    <span>지출 내역 보기</span>
                  </div>
                  <div className="filter-row">
                    <label>
                      <input
                        type="radio"
                        checked={expenseDateMode === "선택 날짜"}
                        onChange={() => setExpenseDateMode("선택 날짜")}
                      />{" "}
                      선택 날짜
                    </label>
                    <input
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                    />
                    <label style={{ marginLeft: 16 }}>
                      <input
                        type="radio"
                        checked={expenseDateMode === "기간"}
                        onChange={() => setExpenseDateMode("기간")}
                      />{" "}
                      기간
                    </label>
                    <input
                      type="date"
                      value={expenseFrom}
                      onChange={(e) => setExpenseFrom(e.target.value)}
                    />
                    <span>~</span>
                    <input
                      type="date"
                      value={expenseTo}
                      onChange={(e) => setExpenseTo(e.target.value)}
                    />
                  </div>
                </div>

                <table className="data-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>지출 내용</th>
                      <th>카드 끝 4자리</th>
                      <th>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.length === 0 && (
                      <tr>
                        <td colSpan={4} className="table-empty">
                          선택된 범위의 지출 내역이 없습니다.
                        </td>
                      </tr>
                    )}
                    {filteredExpenses.map((e) => (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td>{e.storeName}</td>
                        <td>{e.last4}</td>
                        <td>{e.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3} style={{ textAlign: "right" }}>
                        합계
                      </th>
                      <th>{dailyExpenseTotal.toLocaleString()}</th>
                    </tr>
                  </tfoot>
                </table>

                <div className="summary-section" style={{ marginTop: 16 }}>
                  <h3>일자별 총 지출</h3>
                  <table className="data-table" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>날짜</th>
                        <th>총 지출</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseTotalByDate.length === 0 && (
                        <tr>
                          <td colSpan={2} className="table-empty">
                            데이터 없음
                          </td>
                        </tr>
                      )}
                      {expenseTotalByDate.map((row) => (
                        <tr key={row.date}>
                          <td>{row.date}</td>
                          <td>{row.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 누적 손익 현황 */}
          {activeTab === "누적 손익 현황" && (
            <div className="card">
              <h2>누적 손익 현황</h2>
              <div className="card-body">
                <div className="summary-section">
                  <div className="summary-header">
                    <span>월별 손익</span>
                    <div className="form-field" style={{ maxWidth: 160 }}>
                      <label>월 선택</label>
                      <input
                        type="month"
                        value={summaryMonth}
                        onChange={(e) => setSummaryMonth(e.target.value)}
                      />
                    </div>
                  </div>
                  <table className="data-table" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>월</th>
                        <th>매출</th>
                        <th>지출</th>
                        <th>손익</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{summaryMonth}</td>
                        <td>{monthlySummary.sales.toLocaleString()}</td>
                        <td>{monthlySummary.expenses.toLocaleString()}</td>
                        <td
                          className={
                            monthlySummary.profit >= 0
                              ? "profit-positive"
                              : "profit-negative"
                          }
                        >
                          {monthlySummary.profit.toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="summary-section">
                  <div className="summary-header">
                    <span>연도별 월 손익</span>
                    <div className="form-field" style={{ maxWidth: 160 }}>
                      <label>연도 선택</label>
                      <input
                        type="number"
                        value={summaryYear}
                        onChange={(e) => setSummaryYear(e.target.value)}
                      />
                    </div>
                  </div>
                  <table className="data-table" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>월</th>
                        <th>매출</th>
                        <th>지출</th>
                        <th>손익</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlySummary.length === 0 && (
                        <tr>
                          <td colSpan={4} className="table-empty">
                            데이터 없음
                          </td>
                        </tr>
                      )}
                      {yearlySummary.map((row) => (
                        <tr key={row.month}>
                          <td>{row.month}</td>
                          <td>{row.sales.toLocaleString()}</td>
                          <td>{row.expenses.toLocaleString()}</td>
                          <td
                            className={
                              row.profit >= 0
                                ? "profit-positive"
                                : "profit-negative"
                            }
                          >
                            {row.profit.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
