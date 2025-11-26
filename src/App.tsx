
// App.tsx - 더바름 진 Sports Clinic 매출/지출 관리 (Supabase 연동 버전)
import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import { supabase } from "./supabaseClient";
import logo from "./assets/gene-logo.png";
import "./App.css";

/* ---------- 타입 정의 ---------- */

type Role = "팀장" | "일반";
type ItemType = "운동 검사" | "PT" | "상품";
type DiscountKey = "할인 없음" | "10%" | "20%" | "30%";
type PaymentMethod = "카드" | "현금" | "계좌 이체";

interface Staff {
  id: string;
  name: string;
  role: Role;
}

interface SaleEntry {
  id: string;
  date: string; // YYYY-MM-DD
  itemType: ItemType;
  product: string;
  staffId: string | null;
  staffRole: Role | null;
  discountKey: DiscountKey;
  paymentMethod: PaymentMethod;
  basePrice: number;
  finalPrice: number;
}

interface ExpenseEntry {
  id: string;
  date: string; // YYYY-MM-DD
  storeName: string;
  last4: string;
  amount: number;
}

interface PersistedData {
  staff: Staff[];
  sales: SaleEntry[];
  expenses: ExpenseEntry[];
}

/* ---------- 가격 테이블 ---------- */

const EXAM_PRICES: Record<string, number> = {
  종합검사: 2_800_000,
  기본검사: 100_000,
  "3D동작분석": 400_000,
  메디컬테스트: 650_000,
  운동부하검사: 400_000,
  "등속성 + 윈게이트": 350_000,
  "등속성 근 기능검사": 100_000,
  윈게이트: 50_000,
  중력조절보행검사: 50_000,
  중력조절보행재활: 150_000,
  "재활운동 프로그램": 100_000,
};

const PT_TEAM_PRICES: Record<string, number> = {
  "1회권": 100_000,
  "10회권": 900_000,
  "20회권": 1_700_000,
  "30회권": 2_400_000,
};

const PT_NORMAL_PRICES: Record<string, number> = {
  "1회권": 80_000,
  "10회권": 750_000,
  "20회권": 1_400_000,
  "30회권": 1_950_000,
};

const PT_GROUP_PRICES: Record<string, number> = {
  "그룹 1개월": 350_000,
  "그룹 3개월": 900_000,
  "그룹 5개월": 1_250_000,
};

const PRODUCT_PRICES: Record<string, number> = {
  ZT: 55_000,
  ZB: 346_000,
  프로틴음료: 5_000,
  게토레이: 2_000,
};

const EXAM_ITEMS = Object.keys(EXAM_PRICES);
const PT_ITEMS = [
  "1회권",
  "10회권",
  "20회권",
  "30회권",
  "그룹 1개월",
  "그룹 3개월",
  "그룹 5개월",
];
const PRODUCT_ITEMS = Object.keys(PRODUCT_PRICES);

const DISCOUNT_OPTIONS: DiscountKey[] = ["할인 없음", "10%", "20%", "30%"];
const ITEM_TYPES: ItemType[] = ["운동 검사", "PT", "상품"];
const PAYMENT_METHODS: PaymentMethod[] = ["카드", "현금", "계좌 이체"];

const LOCAL_STORAGE_KEY = "clinic-app-data-v2";
const ADMIN_CODE = "9577";

/* ---------- 유틸 ---------- */

function discountToRate(key: DiscountKey): number {
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

function formatMd(date: string) {
  const d = dayjs(date);
  if (!d.isValid()) return "";
  return `${d.month() + 1}.${String(d.date()).padStart(2, "0")}`;
}

function getMonthKey(date: string) {
  const d = dayjs(date);
  if (!d.isValid()) return "";
  return d.format("YYYY-MM");
}

function getYearKey(date: string) {
  const d = dayjs(date);
  if (!d.isValid()) return "";
  return d.format("YYYY");
}

function writeCell(
  ws: XLSX.WorkSheet,
  row: number,
  col: number,
  value: string | number
) {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  const prev = (ws as any)[addr];
  const cell: any =
    typeof value === "number"
      ? { t: "n" as const, v: value }
      : { t: "s" as const, v: value };
  if (prev && prev.s) {
    cell.s = prev.s;
  }
  (ws as any)[addr] = cell;
}

type FilterMode = "single" | "range";

function inRange(date: string, from: string, to: string) {
  const d = dayjs(date);
  const fromD = dayjs(from);
  const toD = dayjs(to);

  if (!d.isValid() || !fromD.isValid() || !toD.isValid()) return false;

  // fromD보다 같거나 뒤, toD보다 같거나 앞
  return !d.isBefore(fromD, "day") && !d.isAfter(toD, "day");
}


/* ---------- 컴포넌트 ---------- */

const App: React.FC = () => {
  const [data, setData] = useState<PersistedData>({
    staff: [],
    sales: [],
    expenses: [],
  });

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminInput, setAdminInput] = useState("");

  const [activeTab, setActiveTab] = useState<
    "staff" | "sales" | "expenses" | "summary"
  >("staff");

  const [templateArrayBuffer, setTemplateArrayBuffer] =
    useState<ArrayBuffer | null>(null);
  const [exportDate, setExportDate] = useState(dayjs().format("YYYY-MM-DD"));

  // 직원 입력
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<Role>("일반");

  // 매출 입력
  const [saleDate, setSaleDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [saleItemType, setSaleItemType] = useState<ItemType>("운동 검사");
  const [saleProduct, setSaleProduct] = useState("");
  const [saleStaffId, setSaleStaffId] = useState<string | "">("");
  const [saleDiscount, setSaleDiscount] =
    useState<DiscountKey>("할인 없음");
  const [salePayment, setSalePayment] =
    useState<PaymentMethod>("카드");

  // 매출 필터
  const [salesFilterMode, setSalesFilterMode] =
    useState<FilterMode>("single");
  const [salesFilterDate, setSalesFilterDate] = useState(
    dayjs().format("YYYY-MM-DD")
  );
  const [salesFilterFrom, setSalesFilterFrom] = useState(
    dayjs().startOf("month").format("YYYY-MM-DD")
  );
  const [salesFilterTo, setSalesFilterTo] = useState(
    dayjs().endOf("month").format("YYYY-MM-DD")
  );

  // 지출 필터
  const [expFilterMode, setExpFilterMode] =
    useState<FilterMode>("single");
  const [expFilterDate, setExpFilterDate] = useState(
    dayjs().format("YYYY-MM-DD")
  );
  const [expFilterFrom, setExpFilterFrom] = useState(
    dayjs().startOf("month").format("YYYY-MM-DD")
  );
  const [expFilterTo, setExpFilterTo] = useState(
    dayjs().endOf("month").format("YYYY-MM-DD")
  );

  // 손익 연도 필터
  const [summaryYearFilter, setSummaryYearFilter] =
    useState<string>("all");

  /* ---------- 초기 로드 (Supabase + fallback localStorage) ---------- */

  useEffect(() => {
    const load = async () => {
      try {
        const [
          { data: staff, error: staffError },
          { data: sales, error: salesError },
          { data: expenses, error: expensesError },
        ] = await Promise.all([
          supabase
            .from("staff")
            .select("*")
            .order("created_at", { ascending: true }),
          supabase
            .from("sales")
            .select("*")
            .order("date", { ascending: true }),
          supabase
            .from("expenses")
            .select("*")
            .order("date", { ascending: true }),
        ]);

        if (staffError || salesError || expensesError) {
          console.error("Supabase 로드 오류, localStorage로 대체", {
            staffError,
            salesError,
            expensesError,
          });
          throw new Error("supabase load error");
        }

        setData({
          staff: (staff ?? []) as Staff[],
          sales: (sales ?? []) as SaleEntry[],
          expenses: (expenses ?? []) as ExpenseEntry[],
        });
      } catch {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as PersistedData;
            setData(parsed);
          } catch {
            // ignore
          }
        }
      }
    };

    load();
  }, []);

  // 백업용 localStorage 저장
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  /* ---------- 직원 관련 ---------- */

  const staffById = useMemo(() => {
    const m = new Map<string, Staff>();
    data.staff.forEach((s) => m.set(s.id, s));
    return m;
  }, [data.staff]);

  const addStaff = async () => {
    if (!isAdmin) return;
    const name = newStaffName.trim();
    if (!name) return;

    const newStaff: Staff = {
      id: `${Date.now()}-${Math.random()}`,
      name,
      role: newStaffRole,
    };

    const { error } = await supabase.from("staff").insert(newStaff);
    if (error) {
      console.error("직원 추가 실패", error);
      alert("직원 추가 중 오류가 발생했습니다.");
      return;
    }

    setData((prev) => ({ ...prev, staff: [...prev.staff, newStaff] }));
    setNewStaffName("");
  };

  const deleteStaff = async (id: string) => {
    if (!isAdmin) return;

    const { error } = await supabase.from("staff").delete().eq("id", id);
    if (error) {
      console.error("직원 삭제 실패", error);
      alert("직원 삭제 중 오류가 발생했습니다.");
      return;
    }

    setData((prev) => ({
      ...prev,
      staff: prev.staff.filter((s) => s.id !== id),
      sales: prev.sales.map((s) =>
        s.staffId === id ? { ...s, staffId: null, staffRole: null } : s
      ),
    }));
  };

  /* ---------- 매출 입력 ---------- */

  const currentProductOptions = useMemo(() => {
    if (saleItemType === "운동 검사") return EXAM_ITEMS;
    if (saleItemType === "PT") return PT_ITEMS;
    return PRODUCT_ITEMS;
  }, [saleItemType]);

  useEffect(() => {
    setSaleProduct("");
  }, [saleItemType]);

  const calculateBasePrice = (): number => {
    if (!saleProduct) return 0;

    if (saleItemType === "운동 검사") return EXAM_PRICES[saleProduct] ?? 0;

    if (saleItemType === "PT") {
      if (saleProduct.startsWith("그룹"))
        return PT_GROUP_PRICES[saleProduct] ?? 0;

      const staff = saleStaffId ? staffById.get(saleStaffId) ?? null : null;
      const role = staff?.role ?? "일반";

      if (role === "팀장") return PT_TEAM_PRICES[saleProduct] ?? 0;
      return PT_NORMAL_PRICES[saleProduct] ?? 0;
    }

    return PRODUCT_PRICES[saleProduct] ?? 0;
  };

  const addSaleEntry = async () => {
    if (!isAdmin) return;
    if (!saleProduct) return;

    const basePrice = calculateBasePrice();
    const rate = discountToRate(saleDiscount);
    const finalPrice = Math.round(basePrice * (1 - rate));
    const staff = saleStaffId ? staffById.get(saleStaffId) ?? null : null;

    const entry: SaleEntry = {
      id: `${Date.now()}-${Math.random()}`,
      date: saleDate,
      itemType: saleItemType,
      product: saleProduct,
      staffId: saleStaffId || null,
      staffRole: staff?.role ?? null,
      discountKey: saleDiscount,
      paymentMethod: salePayment,
      basePrice,
      finalPrice,
    };

    const { error } = await supabase.from("sales").insert(entry);
    if (error) {
      console.error("매출 추가 실패", error);
      alert("매출 추가 중 오류가 발생했습니다.");
      return;
    }

    setData((prev) => ({ ...prev, sales: [...prev.sales, entry] }));
  };

  const deleteSale = async (id: string) => {
    if (!isAdmin) return;

    const { error } = await supabase.from("sales").delete().eq("id", id);
    if (error) {
      console.error("매출 삭제 실패", error);
      alert("매출 삭제 중 오류가 발생했습니다.");
      return;
    }

    setData((prev) => ({
      ...prev,
      sales: prev.sales.filter((s) => s.id !== id),
    }));
  };

  /* ---------- 지출 업로드 ---------- */

  const handleExpenseUpload = (file: File) => {
    if (!isAdmin) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const buf = e.target?.result;
      if (!buf) return;
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: true,
      });

      const newExpenses: ExpenseEntry[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const colA = row[0];
        const colC = row[2];
        const colD = row[3];
        const colF = row[5];

        if (!colA || !colD || !colF) continue;

        const dateStr =
          typeof colA === "string"
            ? colA.split("(")[0]
            : String(colA);
        const [yy, mm, dd] = dateStr.split(".");
        const isoDate = `${yy}-${mm.padStart(2, "0")}-${dd.padStart(
          2,
          "0"
        )}`;

        const cardStr = String(colC ?? "");
        const last4Match = cardStr.match(/(\d{4})\D*$/);
        const last4 = last4Match ? last4Match[1] : "";

        const amount = Number(colF) || 0;

        const exp: ExpenseEntry = {
          id: `${Date.now()}-${Math.random()}-${i}`,
          date: isoDate,
          storeName: String(colD),
          last4,
          amount,
        };

        newExpenses.push(exp);
      }

      if (newExpenses.length > 0) {
        const { error } = await supabase
          .from("expenses")
          .insert(newExpenses as any);
        if (error) {
          console.error("지출 업로드 실패", error);
          alert("지출 업로드 중 오류가 발생했습니다.");
          return;
        }

        setData((prev) => ({
          ...prev,
          expenses: [...prev.expenses, ...newExpenses],
        }));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const deleteExpense = async (id: string) => {
    if (!isAdmin) return;

    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      console.error("지출 삭제 실패", error);
      alert("지출 삭제 중 오류가 발생했습니다.");
      return;
    }

    setData((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== id),
    }));
  };

  /* ---------- 필터링 ---------- */

  const filteredSales = useMemo(() => {
    if (salesFilterMode === "single") {
      return data.sales.filter((s) => s.date === salesFilterDate);
    }
    return data.sales.filter((s) =>
      inRange(s.date, salesFilterFrom, salesFilterTo)
    );
  }, [data.sales, salesFilterMode, salesFilterDate, salesFilterFrom, salesFilterTo]);

  const filteredExpenses = useMemo(() => {
    if (expFilterMode === "single") {
      return data.expenses.filter((e) => e.date === expFilterDate);
    }
    return data.expenses.filter((e) =>
      inRange(e.date, expFilterFrom, expFilterTo)
    );
  }, [data.expenses, expFilterMode, expFilterDate, expFilterFrom, expFilterTo]);

  const totalSalesByDate = useMemo(() => {
    const map = new Map<string, number>();
    filteredSales.forEach((s) => {
      const sum = map.get(s.date) ?? 0;
      map.set(s.date, sum + s.finalPrice);
    });
    return map;
  }, [filteredSales]);

  const totalExpensesByDate = useMemo(() => {
    const map = new Map<string, number>();
    filteredExpenses.forEach((e) => {
      const sum = map.get(e.date) ?? 0;
      map.set(e.date, sum + e.amount);
    });
    return map;
  }, [filteredExpenses]);

  /* ---------- 손익 요약 ---------- */

  const monthlySummary = useMemo(() => {
    const map = new Map<
      string,
      { revenue: number; expense: number; profit: number }
    >();

    data.sales.forEach((s) => {
      const key = getMonthKey(s.date);
      if (!key) return;
      const rec = map.get(key) || { revenue: 0, expense: 0, profit: 0 };
      rec.revenue += s.finalPrice;
      map.set(key, rec);
    });

    data.expenses.forEach((e) => {
      const key = getMonthKey(e.date);
      if (!key) return;
      const rec = map.get(key) || { revenue: 0, expense: 0, profit: 0 };
      rec.expense += e.amount;
      map.set(key, rec);
    });

    const result: {
      month: string;
      revenue: number;
      expense: number;
      profit: number;
    }[] = [];

    Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .forEach(([month, rec]) => {
        result.push({
          month,
          revenue: rec.revenue,
          expense: rec.expense,
          profit: rec.revenue - rec.expense,
        });
      });

    return result;
  }, [data.sales, data.expenses]);

  const yearlySummary = useMemo(() => {
    const map = new Map<
      string,
      { revenue: number; expense: number; profit: number }
    >();

    data.sales.forEach((s) => {
      const key = getYearKey(s.date);
      if (!key) return;
      const rec = map.get(key) || { revenue: 0, expense: 0, profit: 0 };
      rec.revenue += s.finalPrice;
      map.set(key, rec);
    });

    data.expenses.forEach((e) => {
      const key = getYearKey(e.date);
      if (!key) return;
      const rec = map.get(key) || { revenue: 0, expense: 0, profit: 0 };
      rec.expense += e.amount;
      map.set(key, rec);
    });

    const result: {
      year: string;
      revenue: number;
      expense: number;
      profit: number;
    }[] = [];

    Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .forEach(([year, rec]) => {
        result.push({
          year,
          revenue: rec.revenue,
          expense: rec.expense,
          profit: rec.revenue - rec.expense,
        });
      });

    return result;
  }, [data.sales, data.expenses]);

  const availableSummaryYears = useMemo(() => {
    const set = new Set<string>();
    monthlySummary.forEach((m) => {
      set.add(m.month.slice(0, 4));
    });
    return Array.from(set).sort();
  }, [monthlySummary]);

  /* ---------- 엑셀 템플릿 ---------- */

  const handleTemplateUpload = (file: File) => {
    if (!isAdmin) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result;
      if (buf instanceof ArrayBuffer) {
        setTemplateArrayBuffer(buf);
        alert("엑셀 템플릿이 등록되었습니다.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExportExcel = () => {
    if (!isAdmin) {
      alert("관리자만 다운로드할 수 있습니다.");
      return;
    }
    if (!templateArrayBuffer) {
      alert("먼저 매출/지출 템플릿 엑셀 파일을 업로드하세요.");
      return;
    }

    const targetDate = exportDate;
    const md = formatMd(targetDate);

    const wb = XLSX.read(templateArrayBuffer, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const salesForDay = data.sales.filter((s) => s.date === targetDate);
    const expensesForDay = data.expenses.filter((e) => e.date === targetDate);

    salesForDay.forEach((s, idx) => {
      const row = 37 + idx;
      const colType = 16;
      const colItem = 17;
      const colDetail = 21;
      const colAmount = 26;
      const colNote = 30;

      writeCell(ws, row, colType, s.paymentMethod);
      writeCell(ws, row, colItem, s.itemType);
      writeCell(ws, row, colDetail, s.product);
      writeCell(ws, row, colAmount, s.finalPrice);
      writeCell(ws, row, colNote, md);
    });

    expensesForDay.forEach((e, idx) => {
      const row = 51 + idx;
      const colContent = 16;
      const colNoteLeft = 20;
      const colNoteRight = 22;
      const colAmount = 24;

      writeCell(ws, row, colContent, e.storeName);
      writeCell(ws, row, colNoteLeft, md);
      writeCell(ws, row, colNoteRight, e.last4);
      writeCell(ws, row, colAmount, e.amount);
    });

    const outFile = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([outFile], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const d = dayjs(exportDate);
    link.download = `매출_지출_${d.format("YYYYMMDD")}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  /* ---------- UI ---------- */

  return (
    <div className="app-root">
      <div className="app-shell">
        <header className="app-header">
          <div className="header-left">
            <img src={logo} alt="더바름 진 로고" className="logo-img" />
            <div className="header-text">
              <div className="header-title">더바름 진 SPORTS CLINIC</div>
              <div className="header-subtitle">매출 · 지출 관리 대시보드</div>
            </div>
          </div>
          <div className="header-right">
            <span className="mode-label">
              현재 모드:{" "}
              <strong className={isAdmin ? "mode-admin" : "mode-view"}>
                {isAdmin ? "관리자" : "조회 전용"}
              </strong>
            </span>
            <div className="admin-box">
              <input
                type="password"
                placeholder="관리자 번호"
                value={adminInput}
                onChange={(e) => setAdminInput(e.target.value)}
              />
              <button
                onClick={() => {
                  if (adminInput === ADMIN_CODE) {
                    setIsAdmin(true);
                    alert("관리자 모드로 전환되었습니다.");
                  } else {
                    setIsAdmin(false);
                    alert("관리자 번호가 올바르지 않습니다. 조회 전용 모드입니다.");
                  }
                }}
              >
                확인
              </button>
            </div>
          </div>
        </header>

        <nav className="tab-nav">
          <button
            className={activeTab === "staff" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("staff")}
          >
            직원 관리
          </button>
          <button
            className={activeTab === "sales" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("sales")}
          >
            일일 매출 입력
          </button>
          <button
            className={activeTab === "expenses" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("expenses")}
          >
            일일 지출 입력
          </button>
          <button
            className={activeTab === "summary" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("summary")}
          >
            누적 손익 현황
          </button>
        </nav>

        <main className="tab-content">
          {/* 직원 탭 */}
          {activeTab === "staff" && (
            <section className="card">
              <h2>직원 관리</h2>
              <div className="card-body">
                <div className="form-row">
                  <input
                    type="text"
                    placeholder="직원 이름"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    disabled={!isAdmin}
                  />
                  <select
                    value={newStaffRole}
                    onChange={(e) =>
                      setNewStaffRole(e.target.value as Role)
                    }
                    disabled={!isAdmin}
                  >
                    <option value="팀장">팀장</option>
                    <option value="일반">일반</option>
                  </select>
                  <button onClick={addStaff} disabled={!isAdmin}>
                    직원 추가
                  </button>
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>직급</th>
                      <th>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.staff.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.role}</td>
                        <td>
                          <button
                            className="btn-small btn-danger"
                            onClick={() => deleteStaff(s.id)}
                            disabled={!isAdmin}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                    {data.staff.length === 0 && (
                      <tr>
                        <td colSpan={3} className="table-empty">
                          등록된 직원이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 매출 탭 */}
          {activeTab === "sales" && (
            <section className="card">
              <h2>일일 매출 입력</h2>
              <div className="card-body">
                <div className="grid-4">
                  <div className="form-field">
                    <label>매출 날짜</label>
                    <input
                      type="date"
                      value={saleDate}
                      onChange={(e) => setSaleDate(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="form-field">
                    <label>품목</label>
                    <select
                      value={saleItemType}
                      onChange={(e) =>
                        setSaleItemType(e.target.value as ItemType)
                      }
                      disabled={!isAdmin}
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>상품</label>
                    <select
                      value={saleProduct}
                      onChange={(e) => setSaleProduct(e.target.value)}
                      disabled={!isAdmin}
                    >
                      <option value="">선택</option>
                      {currentProductOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>담당</label>
                    <select
                      value={saleStaffId}
                      onChange={(e) => setSaleStaffId(e.target.value)}
                      disabled={!isAdmin}
                    >
                      <option value="">선택 없음</option>
                      {data.staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>할인율</label>
                    <select
                      value={saleDiscount}
                      onChange={(e) =>
                        setSaleDiscount(e.target.value as DiscountKey)
                      }
                      disabled={!isAdmin}
                    >
                      {DISCOUNT_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>결제 방법</label>
                    <select
                      value={salePayment}
                      onChange={(e) =>
                        setSalePayment(e.target.value as PaymentMethod)
                      }
                      disabled={!isAdmin}
                    >
                      {PAYMENT_METHODS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>기본 금액</label>
                    <div className="value-box">
                      {calculateBasePrice().toLocaleString()} 원
                    </div>
                  </div>
                  <div className="form-field">
                    <label>할인 적용 금액</label>
                    <div className="value-box">
                      {Math.round(
                        calculateBasePrice() *
                          (1 - discountToRate(saleDiscount))
                      ).toLocaleString()}{" "}
                      원
                    </div>
                  </div>
                </div>

                <button
                  className="btn-primary"
                  onClick={addSaleEntry}
                  disabled={!isAdmin}
                >
                  매출 추가
                </button>

                <div className="filter-box">
                  <div className="filter-header">
                    <span>매출 내역 보기</span>
                    <div className="filter-mode">
                      <label>
                        <input
                          type="radio"
                          checked={salesFilterMode === "single"}
                          onChange={() => setSalesFilterMode("single")}
                        />
                        선택 날짜
                      </label>
                      <label>
                        <input
                          type="radio"
                          checked={salesFilterMode === "range"}
                          onChange={() => setSalesFilterMode("range")}
                        />
                        기간
                      </label>
                    </div>
                  </div>
                  {salesFilterMode === "single" ? (
                    <div className="filter-row">
                      <label>날짜</label>
                      <input
                        type="date"
                        value={salesFilterDate}
                        onChange={(e) =>
                          setSalesFilterDate(e.target.value)
                        }
                      />
                    </div>
                  ) : (
                    <div className="filter-row">
                      <label>시작일</label>
                      <input
                        type="date"
                        value={salesFilterFrom}
                        onChange={(e) =>
                          setSalesFilterFrom(e.target.value)
                        }
                      />
                      <label>종료일</label>
                      <input
                        type="date"
                        value={salesFilterTo}
                        onChange={(e) =>
                          setSalesFilterTo(e.target.value)
                        }
                      />
                    </div>
                  )}
                </div>

                <h3>매출 내역</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>품목</th>
                      <th>상품</th>
                      <th>담당</th>
                      <th>할인</th>
                      <th>결제 방법</th>
                      <th>금액</th>
                      <th>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((s) => (
                      <tr key={s.id}>
                        <td>{s.date}</td>
                        <td>{s.itemType}</td>
                        <td>{s.product}</td>
                        <td>
                          {s.staffId
                            ? `${staffById.get(s.staffId)?.name ?? ""} (${
                                s.staffRole ?? ""
                              })`
                            : "-"}
                        </td>
                        <td>{s.discountKey}</td>
                        <td>{s.paymentMethod}</td>
                        <td>{s.finalPrice.toLocaleString()}</td>
                        <td>
                          <button
                            className="btn-small btn-danger"
                            onClick={() => deleteSale(s.id)}
                            disabled={!isAdmin}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredSales.length === 0 && (
                      <tr>
                        <td colSpan={8} className="table-empty">
                          선택한 범위에 매출 데이터가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <h3>일자별 총 매출</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>총 매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(totalSalesByDate.entries())
                      .sort(([a], [b]) => (a < b ? -1 : 1))
                      .map(([date, amount]) => (
                        <tr key={date}>
                          <td>{date}</td>
                          <td>{amount.toLocaleString()} 원</td>
                        </tr>
                      ))}
                    {totalSalesByDate.size === 0 && (
                      <tr>
                        <td colSpan={2} className="table-empty">
                          데이터 없음
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 지출 탭 */}
          {activeTab === "expenses" && (
            <section className="card">
              <h2>일일 지출 입력</h2>
              <div className="card-body">
                <div className="form-row">
                  <label>승인내역조회 엑셀 업로드</label>
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    disabled={!isAdmin}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleExpenseUpload(file);
                    }}
                  />
                  {!isAdmin && (
                    <span className="hint-text">
                      관리자 모드에서만 업로드 가능합니다.
                    </span>
                  )}
                </div>

                <div className="filter-box">
                  <div className="filter-header">
                    <span>지출 내역 보기</span>
                    <div className="filter-mode">
                      <label>
                        <input
                          type="radio"
                          checked={expFilterMode === "single"}
                          onChange={() => setExpFilterMode("single")}
                        />
                        선택 날짜
                      </label>
                      <label>
                        <input
                          type="radio"
                          checked={expFilterMode === "range"}
                          onChange={() => setExpFilterMode("range")}
                        />
                        기간
                      </label>
                    </div>
                  </div>
                  {expFilterMode === "single" ? (
                    <div className="filter-row">
                      <label>날짜</label>
                      <input
                        type="date"
                        value={expFilterDate}
                        onChange={(e) =>
                          setExpFilterDate(e.target.value)
                        }
                      />
                    </div>
                  ) : (
                    <div className="filter-row">
                      <label>시작일</label>
                      <input
                        type="date"
                        value={expFilterFrom}
                        onChange={(e) =>
                          setExpFilterFrom(e.target.value)
                        }
                      />
                      <label>종료일</label>
                      <input
                        type="date"
                        value={expFilterTo}
                        onChange={(e) =>
                          setExpFilterTo(e.target.value)
                        }
                      />
                    </div>
                  )}
                </div>

                <h3>지출 내역</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>지출 내용</th>
                      <th>카드 끝 4자리</th>
                      <th>금액</th>
                      <th>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((e) => (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td>{e.storeName}</td>
                        <td>{e.last4}</td>
                        <td>{e.amount.toLocaleString()}</td>
                        <td>
                          <button
                            className="btn-small btn-danger"
                            onClick={() => deleteExpense(e.id)}
                            disabled={!isAdmin}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredExpenses.length === 0 && (
                      <tr>
                        <td colSpan={5} className="table-empty">
                          선택한 범위에 지출 데이터가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <h3>일자별 총 지출</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>총 지출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(totalExpensesByDate.entries())
                      .sort(([a], [b]) => (a < b ? -1 : 1))
                      .map(([date, amount]) => (
                        <tr key={date}>
                          <td>{date}</td>
                          <td>{amount.toLocaleString()} 원</td>
                        </tr>
                      ))}
                    {totalExpensesByDate.size === 0 && (
                      <tr>
                        <td colSpan={2} className="table-empty">
                          데이터 없음
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 손익 탭 */}
          {activeTab === "summary" && (
            <section className="card">
              <h2>누적 손익 현황</h2>
              <div className="card-body">
                <div className="summary-section">
                  <div className="summary-header">
                    <h3>월별 손익</h3>
                    <div className="form-row">
                      <label>연도 필터</label>
                      <select
                        value={summaryYearFilter}
                        onChange={(e) =>
                          setSummaryYearFilter(e.target.value)
                        }
                      >
                        <option value="all">전체</option>
                        {availableSummaryYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>월</th>
                        <th>총 매출</th>
                        <th>총 지출</th>
                        <th>손익</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlySummary
                        .filter((m) =>
                          summaryYearFilter === "all"
                            ? true
                            : m.month.startsWith(summaryYearFilter)
                        )
                        .map((m) => (
                          <tr key={m.month}>
                            <td>{m.month}</td>
                            <td>{m.revenue.toLocaleString()}</td>
                            <td>{m.expense.toLocaleString()}</td>
                            <td
                              className={
                                m.profit >= 0
                                  ? "profit-positive"
                                  : "profit-negative"
                              }
                            >
                              {m.profit.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      {monthlySummary.length === 0 && (
                        <tr>
                          <td colSpan={4} className="table-empty">
                            데이터 없음
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="summary-section">
                  <div className="summary-header">
                    <h3>연도별 손익</h3>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>연도</th>
                        <th>총 매출</th>
                        <th>총 지출</th>
                        <th>손익</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlySummary.map((y) => (
                        <tr key={y.year}>
                          <td>{y.year}</td>
                          <td>{y.revenue.toLocaleString()}</td>
                          <td>{y.expense.toLocaleString()}</td>
                          <td
                            className={
                              y.profit >= 0
                                ? "profit-positive"
                                : "profit-negative"
                            }
                          >
                            {y.profit.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {yearlySummary.length === 0 && (
                        <tr>
                          <td colSpan={4} className="table-empty">
                            데이터 없음
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="export-box">
                  <h3>엑셀 템플릿 업로드 & 다운로드</h3>
                  <div className="form-row">
                    <label>템플릿 업로드</label>
                    <input
                      type="file"
                      accept=".xlsx"
                      disabled={!isAdmin}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleTemplateUpload(file);
                      }}
                    />
                  </div>
                  <div className="form-row">
                    <label>다운로드 날짜 선택</label>
                    <input
                      type="date"
                      value={exportDate}
                      onChange={(e) => setExportDate(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handleExportExcel}
                    disabled={!isAdmin}
                  >
                    선택 날짜 기준 최종 엑셀 파일 다운로드
                  </button>
                  {!isAdmin && (
                    <p className="hint-text">
                      관리자 모드에서만 템플릿 업로드/다운로드가 가능합니다.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
