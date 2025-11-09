// src/pages/dashboards/admin/AdminStudents.jsx
// Admin-only list of students with their enrolled classes.
// Optimized to use ONE paginated API call (/api/students-with-classes)
// instead of N+1 (getUsers + per-student getStudentsClasses).

import { useContext, useEffect, useMemo, useState } from "react";
import { UserContext } from "@/contexts/UserContext.jsx";
import { useLocation, Link } from "wouter";
import { useAuth } from "@clerk/clerk-react";
import { IoPersonOutline } from "react-icons/io5";
import { getLevels } from "@/wrappers/level-wrapper";
import { getStudentsForExport } from "@/wrappers/user-wrapper.js";
import Unauthorized from "@/pages/Unauthorized";
import Dropdown from "@/components/Dropdown/Dropdown";
import Button from "@/components/Button/Button";
import SearchBar from "@/components/SearchBar";
import UserItem from "@/components/UserItem";
import SkeletonUser from "@/components/Skeletons/SkeletonUser";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import useDelayedSkeleton from "@/hooks/useDelayedSkeleton";
import ExcelExport from "export-xlsx";
import { SETTINGS_FOR_EXPORT } from "@/assets/excel_export_settings";

const PAGE_SIZE = 100; // Server caps at 200; 100 keeps payloads light.

const AdminStudents = () => {
  const { user } = useContext(UserContext);
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useAuth();

  // Data + UI state
  const [allowRender, setAllowRender] = useState(false);
  const [students, setStudents] = useState([]); // items from API
  const [total, setTotal] = useState(0);
  const [levels, setLevels] = useState([]);
  const [page, setPage] = useState(1);
  const [currFilter, setCurrFilter] = useState(null); // level number | "conversation" | "ielts" | null
  const [searchInput, setSearchInput] = useState("");
  const showSkeleton = useDelayedSkeleton(!allowRender);

  // -------- Helpers --------

  // Coerce "levels" wrapper output (number[] or {level:number}[]) to a number.
  const levelValue = (lv) => (typeof lv === "number" ? lv : lv?.level);

  // Fetch a single page of students (server will include enrolled class details).
  const fetchStudentsPage = async (pageNum) => {
    const url = `/api/students-with-classes?limit=${PAGE_SIZE}&page=${pageNum}`;
    const res = await fetch(url, { credentials: "include" });
    if (res.status === 401 || res.status === 403) {
      // Not authorized on the API — bounce to login to refresh session.
      setLocation("/login");
      return;
    }
    if (!res.ok) throw new Error(`Students fetch failed: ${res.status}`);
    return res.json();
  };

  // Initial load: redirect if not signed in; otherwise load data.
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setLocation("/login");
      return;
    }

    (async () => {
      try {
        const [{ items, total }, lvls] = await Promise.all([
          fetchStudentsPage(1),
          getLevels(),
        ]);
        setStudents(items || []);
        setTotal(total || 0);
        setLevels(lvls || []);
        setPage(1);
        setAllowRender(true);
      } catch (err) {
        console.error("AdminStudents init error:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, user?._id]); // re-run if auth identity changes

  // Client-side filtering and searching
  const filteredStudents = useMemo(() => {
    const q = (searchInput || "").trim().toLowerCase();
    const levelFilter = isNaN(Number(currFilter)) ? currFilter : Number(currFilter);

    return (students || []).filter((u) => {
      const fn = (u.firstName || "").toLowerCase();
      const ln = (u.lastName || "").toLowerCase();
      const full1 = `${fn}${ln}`;
      const full2 = `${ln}${fn}`;

      const matchesName = q ? full1.includes(q) || full2.includes(q) : true;

      const classes = Array.isArray(u.enrolledClasses) ? u.enrolledClasses : [];
      const matchesLevel =
        !currFilter ||
        classes.some((c) =>
          typeof levelFilter === "number" ? c.level === levelFilter : c.level === levelFilter
        );

      const matchesClass =
        !q ||
        classes.some(
          (c) =>
            (c.ageGroup || "").toLowerCase().includes(q) ||
            (c.instructor || "").toLowerCase().includes(q)
        );

      return matchesName && matchesLevel && matchesClass;
    });
  }, [students, searchInput, currFilter]);

  // Guard: only admins can view this page
  if (user && user.privilege !== "admin") {
    return <Unauthorized />;
  }

  // Export as Excel (server returns pre-shaped export data)
  const handleExportStudents = async () => {
    try {
      const data = await getStudentsForExport();
      const excelExport = new ExcelExport();
      excelExport.downloadExcel(SETTINGS_FOR_EXPORT, [data]);
    } catch (error) {
      console.error("Error exporting students:", error);
    }
  };

  const handleOptionClick = (lv) => setCurrFilter(lv);

  return (
    <div className="page-format max-w-[96rem] space-y-10">
      <div className="flex flex-col items-start md:flex-row md:items-center md:justify-between">
        <div className="mb-6 md:m-0">
          <h1 className="font-extrabold mb-2">Students</h1>
          <p>List of all students enrolled in Dillar Classes</p>
        </div>
        <Button label={"Export Students"} onClick={handleExportStudents} />
      </div>

      <div className="w-full inline-flex gap-x-4">
        <SearchBar
          input={searchInput}
          setInput={setSearchInput}
          placeholder={"Search for student by name"}
        />

        <Dropdown
          label={
            <div className="flex items-center justify-center gap-x-1">
              <span className="whitespace-nowrap">
                {currFilter ? `Level ${currFilter}` : "All Levels"}
              </span>
            </div>
          }
          buttonClassName="text-black min-w-fit border border-gray-400 px-5 py-3 gap-1 rounded-sm bg-white"
        >
          <button
            key="all"
            className={`w-full text-left px-4 py-2 text-base font-normal text-black hover:bg-gray-100 ${
              currFilter === null ? "text-blue-500 bg-gray-50" : "text-gray-700"
            }`}
            onClick={() => handleOptionClick(null)}
          >
          All Levels
          </button>

          {/* Numeric levels */}
          {levels.map((lv) => {
            const val = levelValue(lv);
            return (
              <button
                key={`lvl-${val}`}
                className={`w-full text-left px-4 py-2 text-base font-normal text-black hover:bg-gray-100 ${
                  currFilter === val ? "text-blue-500 bg-gray-50" : "text-gray-700"
                }`}
                onClick={() => handleOptionClick(val)}
              >
                Level {val}
              </button>
            );
          })}

          {/* Supplemental classes */}
          <button
            key="conversation"
            className={`w-full text-left px-4 py-2 text-base font-normal text-black hover:bg-gray-100 ${
              currFilter === "conversation" ? "text-blue-500 bg-gray-50" : "text-gray-700"
            }`}
            onClick={() => handleOptionClick("conversation")}
          >
            Conversation
          </button>
          <button
            key="ielts"
            className={`w-full text-left px-4 py-2 text-base font-normal text-black hover:bg-gray-100 ${
              currFilter === "ielts" ? "text-blue-500 bg-gray-50" : "text-gray-700"
            }`}
            onClick={() => handleOptionClick("ielts")}
          >
            IELTS
          </button>
        </Dropdown>
      </div>

      <div className="text-indigo-900 inline-flex items-center gap-x-2">
        <IoPersonOutline />
        <p className="flex">
          {allowRender ? `${filteredStudents.length} student(s)` : showSkeleton && <Skeleton width={"6rem"} />}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-14 gap-y-3">
        {allowRender ? (
          filteredStudents.map((u) => (
            <Link key={u._id} to={`/admin/user/${encodeURIComponent(u._id)}`}>
              <UserItem key={u._id} privilege="admin" userData={u} isShowClass />
            </Link>
          ))
        ) : (
          showSkeleton && <SkeletonUser count={12} />
        )}
      </div>

      {/* Simple pager (optional; API already supports page/limit) */}
      {allowRender && total > students.length && (
        <div className="flex justify-center gap-3 pt-4">
          <Button
            label="Prev"
            onClick={async () => {
              const next = Math.max(1, page - 1);
              try {
                const { items } = await fetchStudentsPage(next);
                setStudents(items || []);
                setPage(next);
              } catch (e) {
                console.error("Prev page error:", e);
              }
            }}
            disabled={page <= 1}
          />
          <Button
            label="Next"
            onClick={async () => {
              const next = page + 1;
              try {
                const { items } = await fetchStudentsPage(next);
                setStudents(items || []);
                setPage(next);
              } catch (e) {
                console.error("Next page error:", e);
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

export default AdminStudents;