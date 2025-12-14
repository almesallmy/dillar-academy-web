// src/wrappers/volunteer-wrapper.js
import axios from "axios";

export async function getVolunteers({ page = 1, limit = 50, q = "", status = "" } = {}) {
  const { data } = await axios.get("/api/volunteer/all", {
    params: {
      page,
      limit,
      ...(q ? { q } : {}),
      ...(status ? { status } : {}),
    },
  });

  return data; // { items, total, page, limit }
}

export async function updateVolunteerStatus(id, status) {
  const { data } = await axios.patch(`/api/volunteer/${encodeURIComponent(id)}/status`, { status });
  return data;
}

export async function downloadVolunteersCsv({ q = "", status = "" } = {}) {
  const res = await axios.get("/api/volunteer/export.csv", {
    params: {
      ...(q ? { q } : {}),
      ...(status ? { status } : {}),
    },
    responseType: "blob",
  });

  const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "volunteers.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}