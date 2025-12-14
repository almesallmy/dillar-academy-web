// src/pages/dashboards/admin/AdminVolunteers.jsx
// Admin Volunteers dashboard.
// Features:
// - Auth-gated (admins only)
// - Search, status filter, pagination
// - Status updates (optimistic UI)
// - CSV export
//
// Notes:
// - Display labels are mapped for enum-like fields (weeklyHours, uyghurProficiency, preferredTimeOfDay)
//   so the UI stays human-friendly even if stored values are compact.

import { useContext, useEffect, useMemo, useState } from "react";
import { UserContext } from "@/contexts/UserContext.jsx";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/clerk-react";
import Unauthorized from "@/pages/Unauthorized";
import Button from "@/components/Button/Button";
import SearchBar from "@/components/SearchBar";
import Dropdown from "@/components/Dropdown/Dropdown";
import Pagination from "@/components/Pagination/Pagination.jsx";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import useDelayedSkeleton from "@/hooks/useDelayedSkeleton";

import {
  downloadVolunteersCsv,
  getVolunteers,
  updateVolunteerStatus,
} from "@/wrappers/volunteer-wrapper.js";

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

// Value -> label maps (keep these aligned with server/schema enums)
const WEEKLY_HOURS_LABEL = {
  lt1: "Less than 1 hr/week",
  "1_2": "1–2 hrs/week",
  "3_5": "3–5 hrs/week",
  "6_plus": "6+ hrs/week",
};

const UYGHUR_LABEL = {
  fluent_native: "Fluent / Native",
  professional: "Professional working proficiency",
  conversational: "Conversational",
  none: "Not proficient",
};

const PREF_TIME_LABEL = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  flexible: "Flexible",
};

function formatDateISO(d) {
  if (!d) return "";
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function labelOrDash(map, value) {
  if (!value) return "—";
  return map[value] || value; // fallback shows raw value if new enum appears
}

const AdminVolunteers = () => {
  const { user } = useContext(UserContext);
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useAuth();

  const [loading, setLoading] = useState(true);
  const [allowRender, setAllowRender] = useState(false);
  const showSkeleton = useDelayedSkeleton(loading);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const headerCount = useMemo(() => `${total} volunteer(s)`, [total]);

  // Debounce search input for better UX & fewer requests
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput), 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Initial auth gate + first page load
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setLocation("/login");
      return;
    }

    (async () => {
      try {
        setLoading(true);
        await loadPage(1);
        setAllowRender(true);
      } catch (err) {
        console.error("AdminVolunteers init error:", err);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, user?._id]);

  // Reload when filters change
  useEffect(() => {
    if (!allowRender) return;
    setPage(1);
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, debouncedSearch]);

  async function loadPage(nextPage) {
    try {
      setPage(nextPage);
      setLoading(true);

      const data = await getVolunteers({
        page: nextPage,
        limit: PAGE_SIZE,
        q: debouncedSearch.trim(),
        status: statusFilter,
      });

      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) setLocation("/login");
      else console.error("loadPage error:", err);
    } finally {
      setLoading(false);
    }
  }

  // Guard: only admins can view
  if (user && user.privilege !== "admin") {
    return <Unauthorized />;
  }

  const handleExport = async () => {
    try {
      await downloadVolunteersCsv({
        q: debouncedSearch.trim(),
        status: statusFilter,
      });
    } catch (err) {
      console.error("CSV export failed:", err);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    // Optimistic update
    const prev = items;
    setItems((curr) => curr.map((v) => (v._id === id ? { ...v, status: newStatus } : v)));

    try {
      await updateVolunteerStatus(id, newStatus);
    } catch (err) {
      console.error("Status update failed:", err);
      // Revert on failure
      setItems(prev);
    }
  };

  return (
    <div className="page-format max-w-[96rem] space-y-10">
      <div className="flex flex-col items-start md:flex-row md:items-center md:justify-between">
        <div className="mb-6 md:m-0">
          <h1 className="font-extrabold mb-2">Volunteers</h1>
          <p>Review volunteer applications and update status.</p>
        </div>
        <Button label={"Export CSV"} onClick={handleExport} />
      </div>

      <div className="w-full inline-flex gap-x-4">
        <SearchBar
          input={searchInput}
          setInput={setSearchInput}
          placeholder={"Search by name, email, or subjects"}
        />

        <Dropdown
          label={
            <div className="flex items-center justify-center gap-x-1">
              <span className="whitespace-nowrap">
                {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label || "All Statuses"}
              </span>
            </div>
          }
          buttonClassName="text-black min-w-fit border border-gray-400 px-5 py-3 gap-1 rounded-sm bg-white"
        >
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value || "all"}
              className={`w-full text-left px-4 py-2 text-base font-normal text-black hover:bg-gray-100 ${
                statusFilter === opt.value ? "text-blue-500 bg-gray-50" : "text-gray-700"
              }`}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </Dropdown>
      </div>

      <div className="text-indigo-900 inline-flex items-center gap-x-2">
        <p className="flex">
          {allowRender ? headerCount : showSkeleton && <Skeleton width={"8rem"} />}
        </p>
      </div>

      <div className="w-full overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Hours</th>
              <th className="text-left px-4 py-3">Uyghur</th>
              <th className="text-left px-4 py-3">Preferred time</th>
              <th className="text-left px-4 py-3">Timezone</th>
              <th className="text-left px-4 py-3">Start</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Created</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {!allowRender || loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><Skeleton /></td>
                  <td className="px-4 py-3"><Skeleton /></td>
                  <td className="px-4 py-3"><Skeleton width={80} /></td>
                  <td className="px-4 py-3"><Skeleton width={90} /></td>
                  <td className="px-4 py-3"><Skeleton width={140} /></td>
                  <td className="px-4 py-3"><Skeleton width={110} /></td>
                  <td className="px-4 py-3"><Skeleton width={90} /></td>
                  <td className="px-4 py-3"><Skeleton width={90} /></td>
                  <td className="px-4 py-3"><Skeleton width={110} /></td>
                  <td className="px-4 py-3"><Skeleton width={110} /></td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-gray-500" colSpan={10}>
                  No volunteers found.
                </td>
              </tr>
            ) : (
              items.map((v) => (
                <tr key={v._id} className="text-gray-800 align-top">
                  <td className="px-4 py-3">{v.name}</td>
                  <td className="px-4 py-3">{v.email}</td>
                  <td className="px-4 py-3">{v.roleInterest || "—"}</td>
                  <td className="px-4 py-3">{labelOrDash(WEEKLY_HOURS_LABEL, v.weeklyHours)}</td>
                  <td className="px-4 py-3">{labelOrDash(UYGHUR_LABEL, v.uyghurProficiency)}</td>
                  <td className="px-4 py-3">{labelOrDash(PREF_TIME_LABEL, v.preferredTimeOfDay)}</td>
                  <td className="px-4 py-3">{v.timezone || "—"}</td>
                  <td className="px-4 py-3">{formatDateISO(v.startDate)}</td>
                  <td className="px-4 py-3">
                    <select
                      className="border border-gray-300 rounded-sm px-2 py-1"
                      value={v.status || "pending"}
                      onChange={(e) => handleStatusChange(v._id, e.target.value)}
                      disabled={loading}
                    >
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">{formatDateISO(v.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {allowRender && total > 0 && (
        <div className="pt-6">
          <Pagination
            page={page}
            total={total}
            limit={PAGE_SIZE}
            busy={loading}
            onChange={(p) => {
              if (p !== page) loadPage(p);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default AdminVolunteers;