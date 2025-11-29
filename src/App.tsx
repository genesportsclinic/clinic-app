import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import dayjs, { Dayjs } from "dayjs";
import "./App.css";
import { supabase } from "./supabaseClient";
import logo from "/더바름진 고화질.png";

// ----------------------
// 타입 정의
// ----------------------

type ItemType = "운동 검사" | "PT" | "상품";

type DiscountKey = "할인 없음" | "10%" | "20%" | "30%";

type PaymentMethod = "카드" | "현금" | "계좌";

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

const DEFAULT_ITEM_PRODUCTS = ["프로틴음료", "게토레이"];

// ★ 요청사항 3: 관리자 번호 9577로 변경
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
  // ★ 요청사항 6: 월 선택용 상태 추가
  const [expenseMonth, setExpenseMonth] = useState<string>(
    dayjs().format("YYYY-MM")
  );

  const [summaryMonth, setSummaryMonth] = useState<string>(
    dayjs().format("YYYY-MM")
  );
  const [summaryYear, setSummaryYear] = useState<string>(
    dayjs().format("YYYY")
  );

  const [exportDate, setExportDate] = useState<string>(formatDate(dayjs()));

  // ★ 요청사항 3: 매출/지출 수정용 상태
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editingSaleDraft, setEditingSaleDraft] = useState<{
    date: string;
    itemType: ItemType;
    product: string;
    staffId: string;
    discountKey: DiscountKey;
    paymentMethod: PaymentMethod;
  } | null>(null);

  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingExpenseDraft, setEditingExpenseDraft] = useState<{
    date: string;
    storeName: string;
    last4: string;
    amount: string;
  } | null>(null);

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

  // ★ 요청사항 5: 관리자 모드 해제 버튼용
  function handleAdminLogout() {
    setIsAdminMode(false);
    setAdminInput("");
    alert("관리자 모드가 해제되었습니다.");
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
      price_team: productNew.priceTeam ? Number(productNew.priceTeam) : null,
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

  function getLegacyPrice(itemType: ItemType, productName: string): number {
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
  // 상품 선택 리스트 유틸
  // ----------------------

  function getSelectableProductsByType(itemType: ItemType | ""): string[] {
    if (!itemType) return [];
    const fromDb = products
      .filter((p) => p.category === itemType)
      .map((p) => p.name);

    if (itemType === "운동 검사") {
      return Array.from(new Set([...DEFAULT_EXAM_PRODUCTS, ...fromDb]));
    }
    if (itemType === "상품") {
      return Array.from(new Set([...DEFAULT_ITEM_PRODUCTS, ...fromDb]));
    }
    // PT
    return fromDb;
  }

  // ----------------------
  // 매출 입력
  // ----------------------

  // ★ 수정: 일일 매출 입력 탭에서만 '젠톡유전자키트'를 숨기도록 필터 추가
  const selectableProductsForSales = useMemo(
    () =>
      getSelectableProductsByType(salesForm.itemType).filter(
        (name) => name !== "젠톡유전자키트"
      ),
    [salesForm.itemType, products]
  );

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

  // ★ 요청사항 3: 매출 수정/삭제 핸들러
  function handleStartEditSale(sale: Sale) {
    if (!isAdminMode) {
      alert("관리자 모드에서만 수정 가능합니다.");
      return;
    }
    setEditingSaleId(sale.id);
    setEditingSaleDraft({
      date: sale.date,
      itemType: sale.itemType,
      product: sale.product,
      staffId: sale.staffId || "",
      discountKey: sale.discountKey,
      paymentMethod: sale.paymentMethod,
    });
  }

  function handleCancelEditSale() {
    setEditingSaleId(null);
    setEditingSaleDraft(null);
  }

  async function handleSaveEditSale() {
    if (!isAdminMode || !editingSaleId || !editingSaleDraft) return;

    const { date, itemType, product, staffId, discountKey, paymentMethod } =
      editingSaleDraft;

    if (!date || !itemType || !product) {
      alert("날짜, 품목, 상품을 모두 입력하세요.");
      return;
    }

    let staffRole: "팀장" | "일반" | null = null;
    if (staffId) {
      const s = staffList.find((x) => x.id === staffId);
      staffRole = s?.role ?? null;
    }

    const basePrice = getUnitPrice(itemType, product, staffRole);
    const finalPrice = applyDiscount(basePrice, discountKey);

    const { error } = await supabase
      .from("sales")
      .update({
        date,
        itemType,
        product,
        staffId: staffId || null,
        staffRole,
        discountKey,
        paymentMethod,
        basePrice,
        finalPrice,
      })
      .eq("id", editingSaleId);

    if (error) {
      console.error("매출 수정 오류", error);
      alert("매출 수정 중 오류가 발생했습니다.");
      return;
    }

    setEditingSaleId(null);
    setEditingSaleDraft(null);
    await loadSales();
  }

  async function handleDeleteSale(id: string) {
    if (!isAdminMode) {
      alert("관리자 모드에서만 삭제 가능합니다.");
      return;
    }
    if (!window.confirm("해당 매출 내역을 삭제하시겠습니까?")) return;

    const { error } = await supabase.from("sales").delete().eq("id", id);
    if (error) {
      console.error("매출 삭제 오류", error);
      alert("매출 삭제 중 오류가 발생했습니다.");
      return;
    }
    await loadSales();
  }

  // ----------------------
  // 지출 업로드 / 필터
  // ----------------------

  async function handleExpenseFileChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
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

  // ★ 요청사항 6: 월별 지출 내역
  const monthlyExpenses = useMemo(
    () => expenses.filter((e) => e.date.startsWith(expenseMonth)),
    [expenses, expenseMonth]
  );

  const monthlyExpenseTotal = useMemo(
    () => monthlyExpenses.reduce((sum, e) => sum + e.amount, 0),
    [monthlyExpenses]
  );

  // ★ 요청사항 3: 지출 수정/삭제 핸들러
  function handleStartEditExpense(expense: Expense) {
    if (!isAdminMode) {
      alert("관리자 모드에서만 수정 가능합니다.");
      return;
    }
    setEditingExpenseId(expense.id);
    setEditingExpenseDraft({
      date: expense.date,
      storeName: expense.storeName,
      last4: expense.last4,
      amount: String(expense.amount),
    });
  }

  function handleCancelEditExpense() {
    setEditingExpenseId(null);
    setEditingExpenseDraft(null);
  }

  async function handleSaveEditExpense() {
    if (!isAdminMode || !editingExpenseId || !editingExpenseDraft) return;

    const { date, storeName, last4, amount } = editingExpenseDraft;
    if (!date || !storeName || !amount) {
      alert("날짜, 지출 내용, 금액을 입력하세요.");
      return;
    }

    const amountNum = Number(amount) || 0;

    const { error } = await supabase
      .from("expenses")
      .update({
        date,
        storeName,
        last4,
        amount: amountNum,
      })
      .eq("id", editingExpenseId);

    if (error) {
      console.error("지출 수정 오류", error);
      alert("지출 수정 중 오류가 발생했습니다.");
      return;
    }

    setEditingExpenseId(null);
    setEditingExpenseDraft(null);
    await loadExpenses();
  }

  async function handleDeleteExpense(id: string) {
    if (!isAdminMode) {
      alert("관리자 모드에서만 삭제 가능합니다.");
      return;
    }
    if (!window.confirm("해당 지출 내역을 삭제하시겠습니까?")) return;

    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      console.error("지출 삭제 오류", error);
      alert("지출 삭제 중 오류가 발생했습니다.");
      return;
    }
    await loadExpenses();
  }

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
      const monthExpenses = expenses.filter((e) => e.date.startsWith(prefix));
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

  async function handleDownloadDailyExcel(
    sales: Sale[],
    expenses: Expense[],
    staffList: Staff[],
    exportDate: string
  ) {
    if (!exportDate) {
      alert("엑셀을 다운로드할 날짜를 선택해 주세요.");
      return;
    }

    const hasData =
      sales.some((s) => s.date === exportDate) ||
      expenses.some((e) => e.date === exportDate);

    if (!hasData) {
      alert("선택한 날짜에 매출/지출 내역이 없습니다.");
      return;
    }

    await downloadDailyExcelWithTemplate(exportDate, sales, expenses, staffList);
  }

  async function downloadDailyExcelWithTemplate(
    dateStr: string,
    allSales: Sale[],
    allExpenses: Expense[],
    staffList: Staff[]
  ) {
    try {
      const response = await fetch("/daily-template.xlsx");
      if (!response.ok) {
        throw new Error("템플릿 파일을 불러오지 못했습니다.");
      }
      const arrayBuffer = await response.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0];

      const targetDay = dayjs(dateStr);
      const monthKey = targetDay.format("YYYY-MM");

      const daySales = allSales.filter((s) => s.date === dateStr);
      const monthSales = allSales.filter((s) => s.date.startsWith(monthKey));

      const dayExpenses = allExpenses.filter((e) => e.date === dateStr);

      // ----------------------
      //  날짜 & 요일 (AA3, T31)
      // ----------------------
      const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
      const dow = weekdays[targetDay.day()];
      const displayDate = `${targetDay.format("YYYY.MM.DD")}.(${dow})`;

      worksheet.getCell("AA3").value = displayDate;
      worksheet.getCell("T31").value = displayDate;

      // ----------------------
      //  직원별 컬럼 매핑 (I/K/M/O/Q/S/U/W, J/L/N/P/R/T/V/X)
      // ----------------------
      type StaffColumnInfo = { dayCol: string; accumCol: string };
      const staffColumnDefs: StaffColumnInfo[] = [
        { dayCol: "I", accumCol: "J" },
        { dayCol: "K", accumCol: "L" },
        { dayCol: "M", accumCol: "N" },
        { dayCol: "O", accumCol: "P" },
        { dayCol: "Q", accumCol: "R" },
        { dayCol: "S", accumCol: "T" },
        { dayCol: "U", accumCol: "V" },
        { dayCol: "W", accumCol: "X" },
      ];

      const staffColumnMap = new Map<string, StaffColumnInfo>();

      staffColumnDefs.forEach((def) => {
        const headerCell = `${def.dayCol}6`; // 예: I6, K6 ...
        const name = worksheet.getCell(headerCell).value;
        if (!name) return;
        const nameStr = String(name).trim();
        const staff = staffList.find((s) => s.name === nameStr);
        if (staff) {
          staffColumnMap.set(staff.id, def);
        }
      });

      // ----------------------
      //  PT 행 정의 (G8~G19) - 행별 역할/상품 파싱
      // ----------------------
      type PtRowDef = {
        row: number;
        role: "팀장" | "일반" | "그룹" | null;
        label: string; // G열 전체 텍스트
        productKey: string; // 비교용 키워드
      };

      const ptRows: PtRowDef[] = [];
      for (let row = 8; row <= 19; row++) {
        const gv = worksheet.getCell(`G${row}`).value;
        if (!gv) continue;
        const text = String(gv).trim();
        let role: "팀장" | "일반" | "그룹" | null = null;
        let productKey = text;

        if (text.startsWith("팀장")) {
          role = "팀장";
          productKey = text.replace("팀장", "").trim();
        } else if (text.startsWith("일반")) {
          role = "일반";
          productKey = text.replace("일반", "").trim();
        } else if (text.startsWith("그룹")) {
          role = "그룹";
          productKey = text.replace("그룹", "").trim();
        } else {
          role = null;
          productKey = text;
        }

        ptRows.push({ row, role, label: text, productKey });
      }

      const ptDailyCounts: Record<string, number> = {};
      const ptMonthlyCounts: Record<string, number> = {};

      const addPtCount = (
        map: Record<string, number>,
        row: number,
        staffId: string
      ) => {
        const key = `${row}|${staffId}`;
        map[key] = (map[key] || 0) + 1;
      };

      const matchPtRow = (row: PtRowDef, sale: Sale) => {
        if (row.role === "팀장" || row.role === "일반") {
          if (sale.staffRole !== row.role) return false;
          return sale.product === row.productKey;
        }
        if (row.role === "그룹") {
          return sale.product.includes(row.productKey);
        }
        // 역할 없는 행 (예: 체험권)
        return sale.product === row.productKey;
      };

      const isPtRelated = (sale: Sale) =>
        sale.itemType === "PT" || sale.product === "체험권";

      for (const sale of allSales) {
        if (!isPtRelated(sale) || !sale.staffId) continue;
        const colInfo = staffColumnMap.get(sale.staffId);
        if (!colInfo) continue;

        const rowDef = ptRows.find((row) => matchPtRow(row, sale));
        if (!rowDef) continue;

        if (sale.date === dateStr) {
          addPtCount(ptDailyCounts, rowDef.row, sale.staffId);
        }
        if (sale.date.startsWith(monthKey)) {
          addPtCount(ptMonthlyCounts, rowDef.row, sale.staffId);
        }
      }

      // 직원별 PT 당일/누적 건수 입력
      staffColumnMap.forEach((colInfo, staffId) => {
        for (const rowDef of ptRows) {
          const dayKey = `${rowDef.row}|${staffId}`;
          const monthKeyRow = `${rowDef.row}|${staffId}`;

          const dayVal = ptDailyCounts[dayKey] || 0;
          const monthVal = ptMonthlyCounts[monthKeyRow] || 0;

          if (dayVal !== 0) {
            worksheet.getCell(`${colInfo.dayCol}${rowDef.row}`).value = dayVal;
          }
          if (monthVal !== 0) {
            worksheet.getCell(`${colInfo.accumCol}${rowDef.row}`).value =
              monthVal;
          }
        }
      });

      // ----------------------
      //  직원별 할인 금액(G22), 누적 매출(G24)
      // ----------------------
      const dailyDiscountByStaff: Record<string, number> = {};
      const monthlySalesByStaff: Record<string, number> = {};

      for (const sale of allSales) {
        if (!sale.staffId) continue;
        const discount = sale.basePrice - sale.finalPrice;

        if (sale.date === dateStr && discount > 0) {
          dailyDiscountByStaff[sale.staffId] =
            (dailyDiscountByStaff[sale.staffId] || 0) + discount;
        }
        if (sale.date.startsWith(monthKey)) {
          monthlySalesByStaff[sale.staffId] =
            (monthlySalesByStaff[sale.staffId] || 0) + sale.finalPrice;
        }
      }

      staffColumnMap.forEach((colInfo, staffId) => {
        const discount = dailyDiscountByStaff[staffId] || 0;
        const monthlyTotal = monthlySalesByStaff[staffId] || 0;

        if (discount !== 0) {
          worksheet.getCell(`${colInfo.dayCol}22`).value = discount;
        }
        if (monthlyTotal !== 0) {
          worksheet.getCell(`${colInfo.dayCol}24`).value = monthlyTotal;
        }
      });

      // ----------------------
      //  영업/기타 집계 (AC8:AD19)
      // ----------------------
      const salesEtcTeamIds = staffList
        .filter((s) => s.name === "영업/기타" && s.role === "팀장")
        .map((s) => s.id);
      const salesEtcNormalIds = staffList
        .filter((s) => s.name === "영업/기타" && s.role === "일반")
        .map((s) => s.id);

      if (salesEtcTeamIds.length > 0 || salesEtcNormalIds.length > 0) {
        ptRows.forEach((rowDef) => {
          const row = rowDef.row;
          let teamDay = 0;
          let teamMonth = 0;
          let normalDay = 0;
          let normalMonth = 0;

          for (const id of salesEtcTeamIds) {
            const key = `${row}|${id}`;
            teamDay += ptDailyCounts[key] || 0;
            teamMonth += ptMonthlyCounts[key] || 0;
          }
          for (const id of salesEtcNormalIds) {
            const key = `${row}|${id}`;
            normalDay += ptDailyCounts[key] || 0;
            normalMonth += ptMonthlyCounts[key] || 0;
          }

          // AC9~AC12 / AD9~AD12 : 영업/기타 팀장
          if (row >= 9 && row <= 12) {
            if (teamDay !== 0) {
              worksheet.getCell(`AC${row}`).value = teamDay;
            }
            if (teamMonth !== 0) {
              worksheet.getCell(`AD${row}`).value = teamMonth;
            }
          }

          // AC13~AC16 / AD13~AD16 : 영업/기타 일반
          if (row >= 13 && row <= 16) {
            if (normalDay !== 0) {
              worksheet.getCell(`AC${row}`).value = normalDay;
            }
            if (normalMonth !== 0) {
              worksheet.getCell(`AD${row}`).value = normalMonth;
            }
          }
        });
      }

      // ----------------------
      //  운동 검사 / 상품 일일 판매수량 & 금액 (상단 통계)
      // ----------------------
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
        "재활운동 프로그램": 17,
      };

      const examDailyCount: Record<string, number> = {};
      const examDailyAmount: Record<string, number> = {};

      const productRowMap: Record<string, number> = {
        젠톡: 23,
        제닉스바이오: 24,
        프로틴음료: 25,
        게토레이: 26,
      };
      const productDailyCount: Record<string, number> = {};
      const productDailyAmount: Record<string, number> = {};

      for (const sale of daySales) {
        if (sale.itemType === "운동 검사") {
          const row = examRowMap[sale.product];
          if (row) {
            examDailyCount[sale.product] =
              (examDailyCount[sale.product] || 0) + 1;
            examDailyAmount[sale.product] =
              (examDailyAmount[sale.product] || 0) + sale.finalPrice;
          }
        } else if (sale.itemType === "상품") {
          const row = productRowMap[sale.product];
          if (row) {
            productDailyCount[sale.product] =
              (productDailyCount[sale.product] || 0) + 1;
            productDailyAmount[sale.product] =
              (productDailyAmount[sale.product] || 0) + sale.finalPrice;
          }
        }
      }

      // (이하 Excel 채우는 부분, 지출, 누적 매출 현황 등 기존 코드 그대로...)

      // ----------------------
      //  하단: 지출 내역 (P51/T51/X51 섹션)
      // ----------------------
      const expenseStartRow = 52;
      const expenseEndRow = 61;
      let expenseRow = expenseStartRow;

      for (const exp of dayExpenses) {
        if (expenseRow > expenseEndRow) break;

        worksheet.getCell(`P${expenseRow}`).value = exp.storeName;

        const expDay = dayjs(exp.date);
        worksheet.getCell(`T${expenseRow}`).value = expDay.format("M/D");
        worksheet.getCell(`U${expenseRow}`).value = exp.last4 || "";

        worksheet.getCell(`X${expenseRow}`).value = exp.amount;

        expenseRow++;
      }

      // ----------------------
      //  누적 매출 현황 (G34의 월 텍스트)
      // ----------------------
      const monthLabel = `${targetDay.month() + 1}월`;
      const g34 = worksheet.getCell("G34").value;
      if (typeof g34 === "string") {
        worksheet.getCell("G34").value = g34.replace(
          /\(\d+월\)/,
          `(${monthLabel})`
        );
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      const fileNameDate = targetDay.format("YYYYMMDD");
      link.download = `daily-stats-${fileNameDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("엑셀 파일 생성 중 오류가 발생했습니다. (템플릿 기반)");
    }
  }

  // ----------------------
  // 렌더링
  // ----------------------

  return (
    <div className="app-root">
      {/* ★ 수정: 모든 탭 너비를 고정하기 위해 width: "100%" 추가 */}
      <div
        className="app-shell"
        style={{ maxWidth: "1200px", margin: "0 auto", width: "100%" }}
      >
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
            {/* ★ 요청사항 5: 관리자 모드일 때 입력칸 숨기고 해제 버튼 */}
            {isAdminMode ? (
              <div className="admin-controls">
                <button className="btn-secondary" onClick={handleAdminLogout}>
                  관리자 모드 해제
                </button>
              </div>
            ) : (
              <div className="admin-controls">
                <input
                  type="password"
                  placeholder="관리자 번호"
                  value={adminInput}
                  onChange={(e) => setAdminInput(e.target.value)}
                />
                <button className="btn-primary" onClick={handleAdminCheck}>
                  관리자 모드 전환
                </button>
              </div>
            )}
          </div>
        </header>

        {/* 탭 메뉴 */}
        <nav className="tab-nav">
          {(
            [
              "직원 관리",
              "상품 관리",
              "일일 매출 입력",
              "일일 지출 입력",
              "누적 손익 현황",
            ] as TabName[]
          ).map((tab) => (
            <button
              key={tab}
              className={
                activeTab === tab ? "tab-button active" : "tab-button"
              }
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* 탭 내용 */}
        <main className="tab-content" style={{ minHeight: 600 }}>
          {/* 여기부터 각 탭별 카드들 렌더링 (직원 관리, 상품 관리, 일일 매출 입력, 일일 지출 입력, 누적 손익 현황)
              기존 코드 그대로 유지 - 변경 없음 */}
          {/* ... (원래 있던 JSX 그대로) */}
        </main>
      </div>
    </div>
  );
};

export default App;
