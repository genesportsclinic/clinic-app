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
  staffId: string;
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

// ----------------------
// 유틸 함수
// ----------------------

function formatDate(d: Dayjs) {
  return d.format("YYYY-MM-DD");
}

function parseNumberSafe(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getDiscountRate(key: DiscountKey): number {
  switch (key) {
    case "10%":
      return 0.1;
    case "20%":
      return 0.2;
    case "30%":
      return 0.3;
    default:
      return 0;
  }
}

// ----------------------
// 메인 컴포넌트
// ----------------------

function App() {
  const [activeTab, setActiveTab] = useState<
    "직원 관리" | "일일 매출 입력" | "일일 지출 입력" | "상품 관리" | "누적 손익 현황"
  >("일일 매출 입력");

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState("");

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffNameInput, setStaffNameInput] = useState("");
  const [staffRoleInput, setStaffRoleInput] = useState<"팀장" | "일반">("일반");
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [newProductCategory, setNewProductCategory] = useState<ItemType>("운동 검사");
  const [newProductName, setNewProductName] = useState("");
  const [newProductPriceBase, setNewProductPriceBase] = useState<number>(0);
  const [newProductPriceTeam, setNewProductPriceTeam] = useState<number | "">(0);
  const [newProductPriceNormal, setNewProductPriceNormal] = useState<number | "">(0);
  const [newProductIsGroup, setNewProductIsGroup] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const [sales, setSales] = useState<Sale[]>([]);

  const [salesDateMode, setSalesDateMode] = useState<"선택 날짜" | "기간">("선택 날짜");
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

  const [summaryYear, setSummaryYear] = useState(dayjs().year());
  const [summaryMonth, setSummaryMonth] = useState(dayjs().month() + 1);

  const [selectedSalesUploadFile, setSelectedSalesUploadFile] = useState<File | null>(
    null
  );
  const [selectedExpenseUploadFile, setSelectedExpenseUploadFile] =
    useState<File | null>(null);

  // ----------------------
  // 초기 데이터 로딩 (직원, 상품, 매출, 지출)
  // ----------------------

  useEffect(() => {
    const fetchInitialData = async () => {
      const { data: staffData, error: staffError } = await supabase
        .from("staff")
        .select("*")
        .order("created_at", { ascending: true });
      if (staffError) {
        console.error("직원 목록 로딩 오류:", staffError.message);
      } else if (staffData) {
        setStaffList(staffData as Staff[]);
      }

      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: true });

      if (productError) {
        console.error("상품 목록 로딩 오류:", productError.message);
      } else if (productData) {
        setProducts(productData as Product[]);
      }

      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("*")
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      if (salesError) {
        console.error("매출 로딩 오류:", salesError.message);
      } else if (salesData) {
        setSales(salesData as Sale[]);
      }

      const { data: expenseData, error: expenseError } = await supabase
        .from("expenses")
        .select("*")
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      if (expenseError) {
        console.error("지출 로딩 오류:", expenseError.message);
      } else if (expenseData) {
        setExpenses(expenseData as Expense[]);
      }
    };

    fetchInitialData();
  }, []);

  // ----------------------
  // 관리자 모드
  // ----------------------

  const handleAdminLogin = () => {
    const ADMIN_CODE = "202511"; // 원장님이 정한 관리자 번호
    if (adminCodeInput === ADMIN_CODE) {
      setIsAdminMode(true);
      alert("관리자 모드로 전환되었습니다.");
    } else {
      alert("관리자 번호가 올바르지 않습니다.");
    }
  };

  const handleAdminLogout = () => {
    setIsAdminMode(false);
    setAdminCodeInput("");
  };

  // ----------------------
  // 직원 관리
  // ----------------------

  const handleAddOrUpdateStaff = async () => {
    if (!isAdminMode) {
      alert("관리자 모드에서만 직원 수정이 가능합니다.");
      return;
    }

    const name = staffNameInput.trim();
    if (!name) {
      alert("직원 이름을 입력해 주세요.");
      return;
    }

    if (editingStaffId) {
      const { error } = await supabase
        .from("staff")
        .update({ name, role: staffRoleInput })
        .eq("id", editingStaffId);

      if (error) {
        console.error("직원 수정 오류:", error.message);
        alert("직원 수정 중 오류가 발생했습니다.");
        return;
      }
      setStaffList((prev) =>
        prev.map((s) =>
          s.id === editingStaffId ? { ...s, name, role: staffRoleInput } : s
        )
      );
      setEditingStaffId(null);
      setStaffNameInput("");
    } else {
      const { data, error } = await supabase
        .from("staff")
        .insert({ name, role: staffRoleInput })
        .select()
        .single();

      if (error) {
        console.error("직원 추가 오류:", error.message);
        alert("직원 추가 중 오류가 발생했습니다.");
        return;
      }
      setStaffList((prev) => [...prev, data as Staff]);
      setStaffNameInput("");
    }
  };

  const handleEditStaffClick = (staff: Staff) => {
    if (!isAdminMode) {
      alert("관리자 모드에서만 직원 수정이 가능합니다.");
      return;
    }
    setEditingStaffId(staff.id);
    setStaffNameInput(staff.name);
    setStaffRoleInput(staff.role);
  };

  const handleDeleteStaff = async (id: string) => {
    if (!isAdminMode) {
      alert("관리자 모드에서만 직원 삭제가 가능합니다.");
      return;
    }

    if (!window.confirm("정말 이 직원을 삭제하시겠습니까?")) return;

    const { error } = await supabase.from("staff").delete().eq("id", id);
    if (error) {
      console.error("직원 삭제 오류:", error.message);
      alert("직원 삭제 중 오류가 발생했습니다.");
      return;
    }
    setStaffList((prev) => prev.filter((s) => s.id !== id));
  };

  // ----------------------
  // 상품 관리
  // ----------------------

  const handleAddOrUpdateProduct = async () => {
    if (!isAdminMode) {
      alert("관리자 모드에서만 상품 수정이 가능합니다.");
      return;
    }

    const name = newProductName.trim();
    if (!name) {
      alert("상품 이름을 입력해 주세요.");
      return;
    }

    const price_base = newProductPriceBase || 0;
    const price_team =
      newProductPriceTeam === "" ? null : Number(newProductPriceTeam);
    const price_normal =
      newProductPriceNormal === "" ? null : Number(newProductPriceNormal);

    if (editingProductId) {
      const { error } = await supabase
        .from("products")
        .update({
          category: newProductCategory,
          name,
          price_base,
          price_team,
          price_normal,
          is_group: newProductIsGroup,
        })
        .eq("id", editingProductId);

      if (error) {
        console.error("상품 수정 오류:", error.message);
        alert("상품 수정 중 오류가 발생했습니다.");
        return;
      }

      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProductId
            ? {
                ...p,
                category: newProductCategory,
                name,
                price_base,
                price_team,
                price_normal,
                is_group: newProductIsGroup,
              }
            : p
        )
      );

      setEditingProductId(null);
      setNewProductName("");
      setNewProductPriceBase(0);
      setNewProductPriceTeam(0);
      setNewProductPriceNormal(0);
      setNewProductIsGroup(false);
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert({
          category: newProductCategory,
          name,
          price_base,
          price_team,
          price_normal,
          is_group: newProductIsGroup,
        })
        .select()
        .single();

      if (error) {
        console.error("상품 추가 오류:", error.message);
        alert("상품 추가 중 오류가 발생했습니다.");
        return;
      }

      setProducts((prev) => [...prev, data as Product]);
      setNewProductName("");
      setNewProductPriceBase(0);
      setNewProductPriceTeam(0);
      setNewProductPriceNormal(0);
      setNewProductIsGroup(false);
    }
  };

  const handleEditProductClick = (product: Product) => {
    if (!isAdminMode) {
      alert("관리자 모드에서만 상품 수정이 가능합니다.");
      return;
    }

    setEditingProductId(product.id);
    setNewProductCategory(product.category);
    setNewProductName(product.name);
    setNewProductPriceBase(product.price_base);
    setNewProductPriceTeam(product.price_team ?? "");
    setNewProductPriceNormal(product.price_normal ?? "");
    setNewProductIsGroup(product.is_group);
  };

  const handleDeleteProduct = async (id: string) => {
    if (!isAdminMode) {
      alert("관리자 모드에서만 상품 삭제가 가능합니다.");
      return;
    }

    if (!window.confirm("정말 이 상품을 삭제하시겠습니까?")) return;

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      console.error("상품 삭제 오류:", error.message);
      alert("상품 삭제 중 오류가 발생했습니다.");
      return;
    }

    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => p.category === newProductCategory);
  }, [products, newProductCategory]);

  // ----------------------
  // 매출 입력
  // ----------------------

  const handleSalesFormChange = (
    field: keyof typeof salesForm,
    value: string
  ) => {
    setSalesForm((prev) => ({ ...prev, [field]: value }));
  };

  const filteredSales = useMemo(() => {
    if (salesDateMode === "선택 날짜") {
      return sales.filter((s) => s.date === salesDate);
    }

    const from = dayjs(salesFrom);
    const to = dayjs(salesTo);
    return sales.filter((s) => {
      const d = dayjs(s.date);
      return (d.isSame(from) || d.isAfter(from)) && (d.isSame(to) || d.isBefore(to));
    });
  }, [sales, salesDate, salesFrom, salesTo, salesDateMode]);

  const calculateSaleAmount = (
    itemType: ItemType | "",
    productName: string,
    staffId: string,
    discountKey: DiscountKey
  ) => {
    if (!itemType || !productName) return { basePrice: 0, finalPrice: 0, staffRole: null as "팀장" | "일반" | null };

    const product = products.find(
      (p) => p.category === itemType && p.name === productName
    );
    if (!product) return { basePrice: 0, finalPrice: 0, staffRole: null as "팀장" | "일반" | null };

    const staff = staffList.find((s) => s.id === staffId);
    const staffRole = staff?.role ?? null;

    let basePrice = product.price_base;
    if (itemType === "PT" && !product.is_group && staffRole) {
      if (staffRole === "팀장" && product.price_team != null) {
        basePrice = product.price_team;
      } else if (staffRole === "일반" && product.price_normal != null) {
        basePrice = product.price_normal;
      }
    }

    const discountRate = getDiscountRate(discountKey);
    const discountAmount = Math.round(basePrice * discountRate);
    const finalPrice = basePrice - discountAmount;

    return { basePrice, finalPrice, staffRole };
  };

  const handleAddSale = async () => {
    if (!isAdminMode) {
      alert("관리자 모드에서만 매출 입력이 가능합니다.");
      return;
    }

    const { date, itemType, product, staffId, discountKey, paymentMethod } =
      salesForm;
    if (!date || !itemType || !product || !staffId) {
      alert("날짜, 품목, 상품, 담당을 모두 선택해 주세요.");
      return;
    }

    const { basePrice, finalPrice, staffRole } = calculateSaleAmount(
      itemType,
      product,
      staffId,
      discountKey
    );

    if (!basePrice || !finalPrice) {
      alert("해당 상품의 금액 정보를 확인할 수 없습니다. 상품 관리 탭에서 가격을 먼저 설정해 주세요.");
      return;
    }

    const payload = {
      date,
      itemType,
      product,
      staffId,
      staffRole,
      discountKey,
      paymentMethod,
      basePrice,
      finalPrice,
    };

    const { data, error } = await supabase
      .from("sales")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("매출 저장 오류:", error.message);
      alert("매출 저장 중 오류가 발생했습니다.");
      return;
    }

    setSales((prev) => [...prev, data as Sale]);
    alert("매출이 저장되었습니다.");

    setSalesForm((prev) => ({
      ...prev,
      product: "",
      staffId: "",
      discountKey: "할인 없음",
      paymentMethod: "카드",
    }));
  };

  // ----------------------
  // 지출 업로드 & 관리
  // ----------------------

  const handleExpenseFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      setSelectedExpenseUploadFile(null);
      return;
    }
    setSelectedExpenseUploadFile(e.target.files[0]);
  };

  const handleUploadExpensesFromExcel = async () => {
    if (!isAdminMode) {
      alert("관리자 모드에서만 지출 업로드가 가능합니다.");
      return;
    }

    if (!selectedExpenseUploadFile) {
      alert("지출 엑셀 파일을 선택해 주세요.");
      return;
    }

    const data = await selectedExpenseUploadFile.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    const expensesToInsert: Omit<Expense, "id">[] = [];

    for (let i = 1; i < json.length; i++) {
      const row = json[i];
      if (!row || row.length === 0) continue;

      const dateCell = row[0];
      const descCell = row[3];
      const amountCell = row[5];

      if (!dateCell || !descCell || !amountCell) continue;

      const dateStr = dayjs(dateCell).isValid()
        ? dayjs(dateCell).format("YYYY-MM-DD")
        : dayjs(String(dateCell)).format("YYYY-MM-DD");

      const storeName = String(descCell).trim();
      const rawAmount = parseNumberSafe(amountCell);

      let cCell = row[2];
      let last4 = "";
      if (cCell != null) {
        const cStr = String(cCell).trim();
        const digits = cStr.replace(/\D/g, "");
        if (digits.length >= 4) {
          last4 = digits.slice(-4);
        }
      }

      expensesToInsert.push({
        date: dateStr,
        storeName,
        last4,
        amount: rawAmount,
      });
    }

    if (!expensesToInsert.length) {
      alert("엑셀에서 읽어온 지출 데이터가 없습니다.");
      return;
    }

    const { data: inserted, error } = await supabase
      .from("expenses")
      .insert(expensesToInsert)
      .select();

    if (error) {
      console.error("지출 저장 오류:", error.message);
      alert("지출 저장 중 오류가 발생했습니다.");
      return;
    }

    setExpenses((prev) => [...prev, ...(inserted as Expense[])]);
    alert("지출 데이터가 업로드되었습니다.");
    setSelectedExpenseUploadFile(null);
  };

  // ----------------------
  // 지출 필터링
  // ----------------------

  const filteredExpenses = useMemo(() => {
    if (expenseDateMode === "선택 날짜") {
      return expenses.filter((e) => e.date === expenseDate);
    }

    const from = dayjs(expenseFrom);
    const to = dayjs(expenseTo);
    return expenses.filter((e) => {
      const d = dayjs(e.date);
      return (d.isSame(from) || d.isAfter(from)) && (d.isSame(to) || d.isBefore(to));
    });
  }, [expenses, expenseDateMode, expenseDate, expenseFrom, expenseTo]);

  // ----------------------
  // 누적 손익 계산
  // ----------------------

  const monthlySummary = useMemo(() => {
    const result: {
      month: string;
      sales: number;
      expenses: number;
      profit: number;
    }[] = [];

    for (let m = 1; m <= 12; m++) {
      const monthStr = `${m.toString().padStart(2, "0")}`;

      const salesTotal = sales
        .filter((s) => {
          const d = dayjs(s.date);
          return d.year() === summaryYear && d.month() + 1 === m;
        })
        .reduce((acc, s) => acc + s.finalPrice, 0);

      const expenseTotal = expenses
        .filter((e) => {
          const d = dayjs(e.date);
          return d.year() === summaryYear && d.month() + 1 === m;
        })
        .reduce((acc, e) => acc + e.amount, 0);

      result.push({
        month: `${summaryYear}-${monthStr}`,
        sales: salesTotal,
        expenses: expenseTotal,
        profit: salesTotal - expenseTotal,
      });
    }
    return result;
  }, [summaryYear, sales, expenses]);

  const yearlySummary = useMemo(() => {
    const yearsSet = new Set<number>();
    sales.forEach((s) => {
      yearsSet.add(dayjs(s.date).year());
    });
    expenses.forEach((e) => {
      yearsSet.add(dayjs(e.date).year());
    });

    const years = Array.from(yearsSet).sort((a, b) => a - b);

    return years.map((year) => {
      const salesTotal = sales
        .filter((s) => dayjs(s.date).year() === year)
        .reduce((acc, s) => acc + s.finalPrice, 0);

      const expenseTotal = expenses
        .filter((e) => dayjs(e.date).year() === year)
        .reduce((acc, e) => acc + e.amount, 0);

      return {
        year,
        sales: salesTotal,
        expenses: expenseTotal,
        profit: salesTotal - expenseTotal,
      };
    });
  }, [sales, expenses]);

  // ----------------------
  // 일일 통계 엑셀 다운로드 (템플릿 유지)
  // ----------------------

  async function handleDownloadDailyExcel() {
    if (!isAdminMode) {
      alert("관리자 모드에서만 엑셀 다운로드가 가능합니다.");
      return;
    }

    const targetDate =
      salesDateMode === "선택 날짜" ? salesDate : salesFrom;

    const dailySales = sales.filter((s) => s.date === targetDate);
    const dailyExpenses = expenses.filter((e) => e.date === targetDate);

    if (!dailySales.length && !dailyExpenses.length) {
      alert("선택한 날짜에 매출/지출 데이터가 없습니다.");
      return;
    }

    const examCounts: Record<string, number> = {};
    const examTotals: Record<string, number> = {};
    const itemCounts: Record<string, number> = {};
    const itemTotals: Record<string, number> = {};

    for (const s of dailySales) {
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
      dailySales,
      dailyExpenses,
    });
  }

async function downloadDailyExcelWithTemplate(
    dateStr: string,
    stats: {
      examCounts: Record<string, number>;
      examTotals: Record<string, number>;
      productCounts: Record<string, number>;
      productTotals: Record<string, number>;
      dailySales: Sale[];
      dailyExpenses: Expense[];
    }
  ) {
    // daily-template.xlsx 파일을 그대로 불러와서
    // 서식은 유지하고 값만 채워 넣기 위해 ExcelJS를 사용한다.
    const res = await fetch("/daily-template.xlsx");
    if (!res.ok) {
      alert(
        "엑셀 템플릿을 불러오지 못했습니다. daily-template.xlsx 위치를 확인하세요."
      );
      return;
    }

    const arrayBuffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const worksheet = workbook.worksheets[0];

    // ----------------------
    // 상단 날짜 / 제목 영역
    // ----------------------
    const d = dayjs(dateStr);
    const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];
    const weekdayLabel = weekdayNames[d.day()];
    const dateLabel = `${d.format("YYYY.MM.DD")}.(${weekdayLabel})`;

    worksheet.getCell("AA3").value = dateLabel;
    worksheet.getCell("R31").value = dateLabel;

    const monthNumber = d.month() + 1;
    const cumulativeTitle = `누적 매출 현황 (${monthNumber}월)`;
    worksheet.getCell("G34").value = cumulativeTitle;

    // ----------------------
    // 운동 검사 통계 (상단 표)
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

    let examTotalCount = 0;
    let examTotalAmount = 0;

    Object.entries(examRowMap).forEach(([name, row]) => {
      const count = stats.examCounts[name] ?? 0;
      const total = stats.examTotals[name] ?? 0;
      examTotalCount += count;
      examTotalAmount += total;

      const countCell = worksheet.getCell(`D${row}`);
      const sumCell = worksheet.getCell(`E${row}`);

      if (count !== 0) {
        countCell.value = count;
      }
      if (total !== 0) {
        sumCell.value = total;
      }
    });

    worksheet.getCell("D19").value = examTotalCount;
    worksheet.getCell("E19").value = examTotalAmount;

    // ----------------------
    // 상품 통계 (상단 표)
    // ----------------------
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

      const countCell = worksheet.getCell(`D${row}`);
      const sumCell = worksheet.getCell(`E${row}`);

      if (count !== 0) {
        countCell.value = count;
      }
      if (total !== 0) {
        sumCell.value = total;
      }

      prodTotalAmount += total;
    });

    worksheet.getCell("E27").value = prodTotalAmount;

    // ----------------------
    // 2페이지: 일일 매출 내역 테이블 (행 38~47)
    // ----------------------
    const { dailySales, dailyExpenses } = stats;

    const startRowSales = 38;
    const maxRowsSales = 10;

    for (let i = 0; i < maxRowsSales; i++) {
      const row = startRowSales + i;
      worksheet.getCell(`P${row}`).value = null;
      worksheet.getCell(`Q${row}`).value = null;
      worksheet.getCell(`U${row}`).value = null;
      worksheet.getCell(`Z${row}`).value = null;
      worksheet.getCell(`AD${row}`).value = null;
    }

    const sortedSales = [...dailySales].sort((a, b) => {
      if (a.created_at && b.created_at) {
        return a.created_at < b.created_at ? -1 : 1;
      }
      if (a.date === b.date) return 0;
      return a.date < b.date ? -1 : 1;
    });

    const limitedSales = sortedSales.slice(0, maxRowsSales);

    limitedSales.forEach((s, index) => {
      const row = startRowSales + index;
      worksheet.getCell(`P${row}`).value = s.paymentMethod;
      worksheet.getCell(`Q${row}`).value = s.itemType;
      worksheet.getCell(`U${row}`).value = s.product;
      worksheet.getCell(`Z${row}`).value = s.finalPrice;
      const dLabel = dayjs(s.date).format("MM.DD");
      worksheet.getCell(`AD${row}`).value = dLabel;
    });

    // ----------------------
    // 2페이지: 일일 지출 내역 (행 52~63)
    // ----------------------
    const startRowExp = 52;
    const maxRowsExp = 12;

    for (let i = 0; i < maxRowsExp; i++) {
      const row = startRowExp + i;
      worksheet.getCell(`O${row}`).value = i + 1;
      worksheet.getCell(`P${row}`).value = null;
      worksheet.getCell(`T${row}`).value = null;
      worksheet.getCell(`X${row}`).value = null;
    }

    const sortedExpenses = [...dailyExpenses].sort((a, b) =>
      a.storeName.localeCompare(b.storeName)
    );
    const limitedExpenses = sortedExpenses.slice(0, maxRowsExp);

    limitedExpenses.forEach((e, index) => {
      const row = startRowExp + index;
      worksheet.getCell(`O${row}`).value = index + 1;
      worksheet.getCell(`P${row}`).value = e.storeName;
      const noteParts: string[] = [];
      const dLabel = dayjs(e.date).format("MM.DD");
      if (dLabel) noteParts.push(dLabel);
      if (e.last4) noteParts.push(e.last4);
      worksheet.getCell(`T${row}`).value = noteParts.join(" / ");
      worksheet.getCell(`X${row}`).value = e.amount;
    });

    const fileName = `일일통계_${dateStr}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
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
            <img
              src={logo}
              alt="더바름진 스포츠 클리닉 로고"
              className="clinic-logo"
            />
            <h1 className="app-title">더바름진 스포츠 클리닉 매출/지출 관리</h1>
          </div>
          <div className="header-right">
            <div className="admin-panel">
              <input
                type="password"
                placeholder="관리자 번호 입력"
                value={adminCodeInput}
                onChange={(e) => setAdminCodeInput(e.target.value)}
              />
              {!isAdminMode ? (
                <button onClick={handleAdminLogin}>관리자 모드</button>
              ) : (
                <button onClick={handleAdminLogout}>관리자 해제</button>
              )}
            </div>
          </div>
        </header>

        {/* 탭 메뉴 */}
        <nav className="tab-nav">
          {["직원 관리", "상품 관리", "일일 매출 입력", "일일 지출 입력", "누적 손익 현황"].map(
            (tab) => (
              <button
                key={tab}
                className={
                  activeTab === tab ? "tab-button active" : "tab-button"
                }
                onClick={() =>
                  setActiveTab(
                    tab as
                      | "직원 관리"
                      | "상품 관리"
                      | "일일 매출 입력"
                      | "일일 지출 입력"
                      | "누적 손익 현황"
                  )
                }
              >
                {tab}
              </button>
            )
          )}
        </nav>

        {/* 콘텐츠 영역 */}
        <main className="tab-content">
          {/* 직원 관리 탭 */}
          {activeTab === "직원 관리" && (
            <section>
              <h2>직원 관리</h2>
              <div className="card">
                <div className="form-row">
                  <label>이름</label>
                  <input
                    type="text"
                    value={staffNameInput}
                    onChange={(e) => setStaffNameInput(e.target.value)}
                    disabled={!isAdminMode}
                  />
                </div>
                <div className="form-row">
                  <label>직급</label>
                  <select
                    value={staffRoleInput}
                    onChange={(e) =>
                      setStaffRoleInput(e.target.value as "팀장" | "일반")
                    }
                    disabled={!isAdminMode}
                  >
                    <option value="팀장">팀장</option>
                    <option value="일반">일반</option>
                  </select>
                </div>
                <div className="form-row">
                  <button onClick={handleAddOrUpdateStaff} disabled={!isAdminMode}>
                    {editingStaffId ? "직원 수정" : "직원 추가"}
                  </button>
                </div>
              </div>

              <div className="card">
                <h3>직원 목록</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>직급</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.role}</td>
                        <td>
                          <button onClick={() => handleEditStaffClick(s)} disabled={!isAdminMode}>
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteStaff(s.id)}
                            disabled={!isAdminMode}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                    {staffList.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ textAlign: "center" }}>
                          등록된 직원이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 상품 관리 탭 */}
          {activeTab === "상품 관리" && (
            <section>
              <h2>상품 관리</h2>
              <div className="card">
                <div className="form-row">
                  <label>카테고리</label>
                  <select
                    value={newProductCategory}
                    onChange={(e) =>
                      setNewProductCategory(e.target.value as ItemType)
                    }
                    disabled={!isAdminMode}
                  >
                    <option value="운동 검사">운동 검사</option>
                    <option value="PT">PT</option>
                    <option value="상품">상품</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>상품 이름</label>
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    disabled={!isAdminMode}
                  />
                </div>
                <div className="form-row">
                  <label>기본 가격</label>
                  <input
                    type="number"
                    value={newProductPriceBase}
                    onChange={(e) =>
                      setNewProductPriceBase(parseNumberSafe(e.target.value))
                    }
                    disabled={!isAdminMode}
                  />
                </div>
                <div className="form-row">
                  <label>팀장 가격 (PT 전용)</label>
                  <input
                    type="number"
                    value={newProductPriceTeam}
                    onChange={(e) =>
                      setNewProductPriceTeam(
                        e.target.value === "" ? "" : parseNumberSafe(e.target.value)
                      )
                    }
                    disabled={!isAdminMode}
                  />
                </div>
                <div className="form-row">
                  <label>일반 가격 (PT 전용)</label>
                  <input
                    type="number"
                    value={newProductPriceNormal}
                    onChange={(e) =>
                      setNewProductPriceNormal(
                        e.target.value === "" ? "" : parseNumberSafe(e.target.value)
                      )
                    }
                    disabled={!isAdminMode}
                  />
                </div>
                <div className="form-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={newProductIsGroup}
                      onChange={(e) => setNewProductIsGroup(e.target.checked)}
                      disabled={!isAdminMode}
                    />{" "}
                    그룹 PT 상품 여부
                  </label>
                </div>
                <div className="form-row">
                  <button onClick={handleAddOrUpdateProduct} disabled={!isAdminMode}>
                    {editingProductId ? "상품 수정" : "상품 추가"}
                  </button>
                </div>
              </div>

              <div className="card">
                <h3>상품 목록 ({newProductCategory})</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>상품 이름</th>
                      <th>기본 가격</th>
                      {newProductCategory === "PT" && <th>팀장 가격</th>}
                      {newProductCategory === "PT" && <th>일반 가격</th>}
                      {newProductCategory === "PT" && <th>그룹 여부</th>}
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.price_base.toLocaleString()}원</td>
                        {newProductCategory === "PT" && (
                          <td>
                            {p.price_team != null
                              ? `${p.price_team.toLocaleString()}원`
                              : "-"}
                          </td>
                        )}
                        {newProductCategory === "PT" && (
                          <td>
                            {p.price_normal != null
                              ? `${p.price_normal.toLocaleString()}원`
                              : "-"}
                          </td>
                        )}
                        {newProductCategory === "PT" && (
                          <td>{p.is_group ? "그룹" : "개인"}</td>
                        )}
                        <td>
                          <button
                            onClick={() => handleEditProductClick(p)}
                            disabled={!isAdminMode}
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p.id)}
                            disabled={!isAdminMode}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={newProductCategory === "PT" ? 6 : 3}>
                          등록된 상품이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 일일 매출 입력 탭 */}
          {activeTab === "일일 매출 입력" && (
            <section>
              <h2>일일 매출 입력</h2>
              <div className="card">
                <div className="form-row">
                  <label>날짜</label>
                  <input
                    type="date"
                    value={salesForm.date}
                    onChange={(e) => handleSalesFormChange("date", e.target.value)}
                    disabled={!isAdminMode}
                  />
                </div>
                <div className="form-row">
                  <label>품목</label>
                  <select
                    value={salesForm.itemType}
                    onChange={(e) =>
                      handleSalesFormChange("itemType", e.target.value)
                    }
                    disabled={!isAdminMode}
                  >
                    <option value="">선택</option>
                    <option value="운동 검사">운동 검사</option>
                    <option value="PT">PT</option>
                    <option value="상품">상품</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>상품</label>
                  <select
                    value={salesForm.product}
                    onChange={(e) => handleSalesFormChange("product", e.target.value)}
                    disabled={!isAdminMode}
                  >
                    <option value="">선택</option>
                    {products
                      .filter((p) => p.category === salesForm.itemType)
                      .map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>담당</label>
                  <select
                    value={salesForm.staffId}
                    onChange={(e) => handleSalesFormChange("staffId", e.target.value)}
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
                <div className="form-row">
                  <label>할인율</label>
                  <select
                    value={salesForm.discountKey}
                    onChange={(e) =>
                      handleSalesFormChange(
                        "discountKey",
                        e.target.value as DiscountKey
                      )
                    }
                    disabled={!isAdminMode}
                  >
                    <option value="할인 없음">할인 없음</option>
                    <option value="10%">10%</option>
                    <option value="20%">20%</option>
                    <option value="30%">30%</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>결제 방법</label>
                  <select
                    value={salesForm.paymentMethod}
                    onChange={(e) =>
                      handleSalesFormChange(
                        "paymentMethod",
                        e.target.value as PaymentMethod
                      )
                    }
                    disabled={!isAdminMode}
                  >
                    <option value="카드">카드</option>
                    <option value="현금">현금</option>
                    <option value="계좌 이체">계좌 이체</option>
                  </select>
                </div>

                <div className="form-row">
                  <button onClick={handleAddSale} disabled={!isAdminMode}>
                    매출 등록
                  </button>
                </div>
              </div>

              <div className="card">
                <h3>일일 매출 조회</h3>
                <div className="form-row inline">
                  <label>조회 모드</label>
                  <select
                    value={salesDateMode}
                    onChange={(e) =>
                      setSalesDateMode(
                        e.target.value as "선택 날짜" | "기간"
                      )
                    }
                  >
                    <option value="선택 날짜">선택 날짜</option>
                    <option value="기간">기간</option>
                  </select>
                  {salesDateMode === "선택 날짜" ? (
                    <input
                      type="date"
                      value={salesDate}
                      onChange={(e) => setSalesDate(e.target.value)}
                    />
                  ) : (
                    <>
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
                    </>
                  )}
                </div>

                <table className="data-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>품목</th>
                      <th>상품</th>
                      <th>담당</th>
                      <th>직급</th>
                      <th>할인율</th>
                      <th>결제 방법</th>
                      <th>기본 금액</th>
                      <th>결제 금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((s) => {
                      const staff = staffList.find((st) => st.id === s.staffId);
                      return (
                        <tr key={s.id}>
                          <td>{s.date}</td>
                          <td>{s.itemType}</td>
                          <td>{s.product}</td>
                          <td>{staff?.name ?? ""}</td>
                          <td>{s.staffRole ?? staff?.role ?? ""}</td>
                          <td>{s.discountKey}</td>
                          <td>{s.paymentMethod}</td>
                          <td>{s.basePrice.toLocaleString()}원</td>
                          <td>{s.finalPrice.toLocaleString()}원</td>
                        </tr>
                      );
                    })}
                    {filteredSales.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: "center" }}>
                          조회된 매출 내역이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 일일 지출 입력 탭 */}
          {activeTab === "일일 지출 입력" && (
            <section>
              <h2>일일 지출 입력</h2>

              <div className="card">
                <h3>엑셀 업로드</h3>
                <div className="form-row">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExpenseFileChange}
                    disabled={!isAdminMode}
                  />
                  <button onClick={handleUploadExpensesFromExcel} disabled={!isAdminMode}>
                    지출 엑셀 업로드
                  </button>
                </div>
              </div>

              <div className="card">
                <h3>지출 조회</h3>
                <div className="form-row inline">
                  <label>조회 모드</label>
                  <select
                    value={expenseDateMode}
                    onChange={(e) =>
                      setExpenseDateMode(
                        e.target.value as "선택 날짜" | "기간"
                      )
                    }
                  >
                    <option value="선택 날짜">선택 날짜</option>
                    <option value="기간">기간</option>
                  </select>
                  {expenseDateMode === "선택 날짜" ? (
                    <input
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                    />
                  ) : (
                    <>
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
                    </>
                  )}
                </div>

                <table className="data-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>지출처</th>
                      <th>카드 끝 4자리</th>
                      <th>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((e) => (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td>{e.storeName}</td>
                        <td>{e.last4}</td>
                        <td>{e.amount.toLocaleString()}원</td>
                      </tr>
                    ))}
                    {filteredExpenses.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center" }}>
                          조회된 지출 내역이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 누적 손익 현황 탭 */}
          {activeTab === "누적 손익 현황" && (
            <section>
              <h2>누적 손익 현황</h2>

              <div className="card">
                <div className="form-row inline">
                  <label>연도</label>
                  <input
                    type="number"
                    value={summaryYear}
                    onChange={(e) => setSummaryYear(parseNumberSafe(e.target.value))}
                  />
                </div>

                <h3>월별 손익 현황</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>월</th>
                      <th>매출</th>
                      <th>지출</th>
                      <th>손익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((m) => (
                      <tr key={m.month}>
                        <td>{m.month}</td>
                        <td>{m.sales.toLocaleString()}원</td>
                        <td>{m.expenses.toLocaleString()}원</td>
                        <td>{m.profit.toLocaleString()}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h3 style={{ marginTop: 24 }}>연도별 손익 현황</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>연도</th>
                      <th>매출</th>
                      <th>지출</th>
                      <th>손익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlySummary.map((y) => (
                      <tr key={y.year}>
                        <td>{y.year}</td>
                        <td>{y.sales.toLocaleString()}원</td>
                        <td>{y.expenses.toLocaleString()}원</td>
                        <td>{y.profit.toLocaleString()}원</td>
                      </tr>
                    ))}
                    {yearlySummary.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center" }}>
                          데이터가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="form-row" style={{ marginTop: 24 }}>
                  <label>일일 통계 엑셀 다운로드 날짜</label>
                  <input
                    type="date"
                    value={salesDate}
                    onChange={(e) => setSalesDate(e.target.value)}
                  />
                  <button onClick={handleDownloadDailyExcel} disabled={!isAdminMode}>
                    일일 통계 엑셀 다운로드
                  </button>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
