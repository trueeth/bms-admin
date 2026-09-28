"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resumeBucket, supabase, templateBucket } from "../lib/supabase";

const PAGE_SIZE = 25;
const DEFAULT_TIME_ZONE_LABEL = "local timezone";

function confirmationSettingError(error) {
  const message = error?.message || String(error || "Could not save confirmation URL setting.");
  if (/require_confirmation_url|schema cache|PGRST204/i.test(message)) {
    return new Error("The confirmation URL setting is not available on the database API yet. Reload the Supabase schema cache, then try again.");
  }
  return error instanceof Error ? error : new Error(message);
}

function confirmationHref(value) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

const emptyBidder = {
  id: "",
  user_id: "",
  password: "",
  name: "",
  role: "bidder",
  ip: "",
  country: "",
  job_site: "",
  active: true,
  require_confirmation_url: false,
};

const emptyProfile = {
  id: "",
  profile_name: "",
  first_name: "",
  last_name: "",
  resume_name: "",
  subtitle: "",
  location: "",
  logic: "",
  chatgpt_channel: "",
  template_file_name: "",
  email: "",
  phone: "",
  last4_ssn: "",
  date_of_birth: "",
  race: "",
  age: "",
  experience: "",
  salary: "",
  street: "",
  city: "",
  state: "",
  zipcode: "",
  county: "",
  current_company: "",
  gender: "",
  visa_status: "",
  require_sponsorship: "",
  origin_ethnicity: "",
  veteran_status: "",
  disability_status: "",
  degree: "",
  major: "",
  graduation_year: "",
  education: "",
  availability: "",
  linkedin: "",
  personal_website: "",
  portfolio: "",
  template_storage_path: "",
  notes: "",
  active: true,
};

const emptyBlockedCompany = {
  id: "",
  company_name: "",
  reason: "",
  active: true,
};

const profileFields = [
  ["profile_name", "Profile Name"],
  ["first_name", "First Name"],
  ["last_name", "Last Name"],
  ["resume_name", "Resume Full Name"],
  ["subtitle", "Resume Title"],
  ["location", "Location"],
  ["chatgpt_channel", "ChatGPT Channel"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["last4_ssn", "Last 4 SSN"],
  ["date_of_birth", "Date of Birth"],
  ["race", "Race"],
  ["age", "Age"],
  ["experience", "Experience"],
  ["salary", "Salary"],
  ["street", "Street"],
  ["city", "City"],
  ["state", "State"],
  ["zipcode", "Zipcode"],
  ["county", "County"],
  ["current_company", "Current Company"],
  ["gender", "Gender"],
  ["visa_status", "Visa Status"],
  ["require_sponsorship", "Require Sponsorship"],
  ["origin_ethnicity", "Origin / Ethnicity"],
  ["veteran_status", "Veteran Status"],
  ["disability_status", "Disability Status"],
  ["degree", "Degree"],
  ["major", "Major"],
  ["graduation_year", "Graduation Year"],
  ["availability", "Availability"],
  ["linkedin", "LinkedIn"],
  ["personal_website", "Personal Website"],
  ["portfolio", "Portfolio"],
];

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeFilePart(value) {
  return (value || "profile").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "profile";
}

function safeDownloadName(value, fallback) {
  const base = safeFilePart(String(value || fallback).replace(/\.docx$/i, ""));
  return `${base}.txt`;
}

function logTitle(log) {
  return [log.company_name, log.job_title].filter(Boolean).join(" - ") || "Bid log";
}

function companyKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function formatLogTime(value, timeZone) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const options = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  };
  if (timeZone) {
    options.timeZone = timeZone;
  }
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function defaultProfileName(profile) {
  const explicitName = profile.profile_name?.trim();
  if (explicitName) return explicitName;

  const personName = [profile.first_name, profile.last_name].map((value) => value?.trim()).filter(Boolean).join(" ");
  if (personName) return personName;

  return `Profile ${new Date().toISOString()}`;
}

function normalizeProfilePayload(profile) {
  const { id, ...payload } = profile;
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") {
      payload[key] = value.trim();
    }
  }
  payload.profile_name = defaultProfileName(payload);
  payload.updated_at = new Date().toISOString();
  return { id, payload };
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("bidders");
  const [status, setStatus] = useState({ message: "", error: false });
  const [bidders, setBidders] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [blockedCompanies, setBlockedCompanies] = useState([]);
  const [logs, setLogs] = useState([]);
  const [bidderForm, setBidderForm] = useState(emptyBidder);
  const [profileForm, setProfileForm] = useState(emptyProfile);
  const [blockedForm, setBlockedForm] = useState(emptyBlockedCompany);
  const [templateFile, setTemplateFile] = useState(null);
  const profileFileInputRef = useRef(null);
  const [permissionBidderId, setPermissionBidderId] = useState("");
  const [selectedProfileIds, setSelectedProfileIds] = useState(new Set());
  const [permissionRequireUrl, setPermissionRequireUrl] = useState(false);
  const [blockedSearch, setBlockedSearch] = useState("");
  const [blockedPage, setBlockedPage] = useState(0);
  const [blockedTotal, setBlockedTotal] = useState(0);
  const [logSearch, setLogSearch] = useState("");
  const [logSort, setLogSort] = useState("created_at.desc");
  const [logPage, setLogPage] = useState(0);
  const [logTotal, setLogTotal] = useState(0);
  const [logTimeZone, setLogTimeZone] = useState("");
  const [logViewer, setLogViewer] = useState(null);
  const [copyViewer, setCopyViewer] = useState(null);
  const [copiedSection, setCopiedSection] = useState("");

  const envConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const permissionProfileIds = useMemo(() => {
    return new Set(permissions.filter((row) => row.bidder_id === permissionBidderId).map((row) => row.resume_profile_id));
  }, [permissions, permissionBidderId]);
  const logPageCount = Math.max(1, Math.ceil(logTotal / PAGE_SIZE));
  const logFirstRow = logTotal ? logPage * PAGE_SIZE + 1 : 0;
  const logLastRow = Math.min((logPage + 1) * PAGE_SIZE, logTotal);
  const logTimeZoneLabel = logTimeZone || DEFAULT_TIME_ZONE_LABEL;
  const blockedPageCount = Math.max(1, Math.ceil(blockedTotal / PAGE_SIZE));
  const blockedFirstRow = blockedTotal ? blockedPage * PAGE_SIZE + 1 : 0;
  const blockedLastRow = Math.min((blockedPage + 1) * PAGE_SIZE, blockedTotal);

  async function runRequest(label, fn) {
    try {
      const message = await fn();
      setStatus({ message: message || label, error: false });
    } catch (error) {
      setStatus({ message: error.message || String(error), error: true });
    }
  }

  async function refreshAll() {
    const [{ data: bidderRows, error: biddersError }, { data: profileRows, error: profilesError }, { data: permissionRows, error: permissionsError }] = await Promise.all([
      supabase.from("bidders").select("*").order("user_id", { ascending: true }),
      supabase.from("resume_profiles").select("*").order("profile_name", { ascending: true }),
      supabase.from("bidder_profile_permissions").select("*"),
    ]);
    if (biddersError) throw biddersError;
    if (profilesError) throw profilesError;
    if (permissionsError) throw permissionsError;
    setBidders(bidderRows || []);
    setProfiles(profileRows || []);
    setPermissions(permissionRows || []);
    if (!permissionBidderId && bidderRows?.length) {
      setPermissionBidderId(bidderRows[0].id);
    }
    await Promise.all([loadLogs(), loadBlockedCompanies()]);
  }

  async function loadBlockedCompanies() {
    let query = supabase
      .from("blocked_companies")
      .select("*", { count: "exact" })
      .order("company_name", { ascending: true })
      .range(blockedPage * PAGE_SIZE, blockedPage * PAGE_SIZE + PAGE_SIZE - 1);

    if (blockedSearch.trim()) {
      const term = `%${blockedSearch.trim()}%`;
      query = query.or([
        `company_name.ilike.${term}`,
        `reason.ilike.${term}`,
      ].join(","));
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const total = count ?? data?.length ?? 0;
    if (blockedPage > 0 && total > 0 && blockedPage * PAGE_SIZE >= total) {
      setBlockedPage(Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
      return "Page adjusted";
    }
    setBlockedTotal(total);
    setBlockedCompanies(data || []);
  }

  async function loadLogs() {
    const [field, direction] = logSort.split(".");
    let query = supabase
      .from("bids")
      .select("*", { count: "exact" })
      .order(field, { ascending: direction !== "desc" })
      .range(logPage * PAGE_SIZE, logPage * PAGE_SIZE + PAGE_SIZE - 1);

    if (logSearch.trim()) {
      const term = `%${logSearch.trim()}%`;
      query = query.or([
        `company_name.ilike.${term}`,
        `job_title.ilike.${term}`,
        `job_site.ilike.${term}`,
        `profile_name.ilike.${term}`,
        `bidder_user_id.ilike.${term}`,
        `bidder_name.ilike.${term}`,
        `confirmation_url.ilike.${term}`,
      ].join(","));
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const total = count ?? data?.length ?? 0;
    if (logPage > 0 && total > 0 && logPage * PAGE_SIZE >= total) {
      setLogPage(Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
      return "Page adjusted";
    }
    setLogTotal(total);
    setLogs(data || []);
  }

  useEffect(() => {
    if (envConfigured) {
      runRequest("Loaded", refreshAll);
    }
  }, []);

  useEffect(() => {
    setLogTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  }, []);

  useEffect(() => {
    if (permissionBidderId) {
      setSelectedProfileIds(new Set(permissionProfileIds));
    }
  }, [permissionBidderId, permissionProfileIds]);

  useEffect(() => {
    if (envConfigured) {
      runRequest("Logs loaded", loadLogs);
    }
  }, [logSearch, logSort, logPage]);

  useEffect(() => {
    if (envConfigured) {
      runRequest("Blocked companies loaded", loadBlockedCompanies);
    }
  }, [blockedSearch, blockedPage]);

  useEffect(() => {
    const bidder = bidders.find((row) => row.id === permissionBidderId);
    setPermissionRequireUrl(Boolean(bidder?.require_confirmation_url));
  }, [permissionBidderId, bidders]);

  function updateBidder(name, value) {
    setBidderForm((current) => ({ ...current, [name]: value }));
  }

  function updateProfile(name, value) {
    setProfileForm((current) => ({ ...current, [name]: value }));
  }

  function updateBlockedCompany(name, value) {
    setBlockedForm((current) => ({ ...current, [name]: value }));
  }

  function clearProfileForm() {
    setProfileForm(emptyProfile);
    setTemplateFile(null);
    if (profileFileInputRef.current) {
      profileFileInputRef.current.value = "";
    }
  }

  async function saveBidder(event) {
    event.preventDefault();
    await runRequest("Bidder saved", async () => {
      const { id, password } = bidderForm;
      const payload = {
        user_id: bidderForm.user_id,
        name: bidderForm.name || "",
        role: bidderForm.role || "bidder",
        ip: bidderForm.ip || "",
        country: bidderForm.country || "",
        job_site: bidderForm.job_site || "",
        active: Boolean(bidderForm.active),
        require_confirmation_url: Boolean(bidderForm.require_confirmation_url),
        updated_at: new Date().toISOString(),
      };
      if (password) {
        payload.password_hash = await sha256(password);
      }
      const result = id
        ? await supabase.from("bidders").update(payload).eq("id", id)
        : await supabase.from("bidders").insert(payload);
      if (result.error) throw confirmationSettingError(result.error);
      setBidderForm(emptyBidder);
      await refreshAll();
    });
  }

  async function uploadTemplate(profileName) {
    if (!templateFile) return "";
    const path = `${safeFilePart(profileName)}/${Date.now()}_${safeFilePart(templateFile.name)}`;
    const { error } = await supabase.storage.from(templateBucket).upload(path, templateFile, {
      upsert: true,
      contentType: templateFile.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    if (error) throw error;
    return path;
  }

  async function saveProfile(event) {
    event.preventDefault();
    await runRequest("Profile saved", async () => {
      const { id, payload } = normalizeProfilePayload(profileForm);
      const uploadedPath = await uploadTemplate(payload.profile_name);
      if (uploadedPath) {
        payload.template_storage_path = uploadedPath;
      }
      const result = id
        ? await supabase.from("resume_profiles").update(payload).eq("id", id).select("profile_name").single()
        : await supabase.from("resume_profiles").insert(payload).select("profile_name").single();
      if (result.error) throw result.error;
      clearProfileForm();
      await refreshAll();
      return id ? `Profile updated: ${result.data?.profile_name || payload.profile_name}` : `Profile created: ${result.data?.profile_name || payload.profile_name}`;
    });
  }

  async function saveBlockedCompany(event) {
    event.preventDefault();
    await runRequest("Blocked company saved", async () => {
      const { id, ...payload } = blockedForm;
      payload.company_name = String(payload.company_name || "").trim();
      payload.reason = String(payload.reason || "").trim();
      payload.company_key = companyKey(payload.company_name);
      payload.updated_at = new Date().toISOString();
      if (!payload.company_key) {
        throw new Error("Company name is required.");
      }
      const result = id
        ? await supabase.from("blocked_companies").update(payload).eq("id", id)
        : await supabase.from("blocked_companies").insert(payload);
      if (result.error) throw result.error;
      setBlockedForm(emptyBlockedCompany);
      await loadBlockedCompanies();
      return id ? "Blocked company updated" : "Blocked company added";
    });
  }

  async function deleteRow(table, id, successMessage) {
    await runRequest(successMessage, async () => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      await refreshAll();
    });
  }

  async function saveBidderConfirmationRule(bidderId, required) {
    const { error } = await supabase
      .from("bidders")
      .update({
        require_confirmation_url: Boolean(required),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bidderId);
    if (error) throw confirmationSettingError(error);
  }

  async function savePermissions() {
    if (!permissionBidderId) return;
    await runRequest("Permissions saved", async () => {
      await saveBidderConfirmationRule(permissionBidderId, permissionRequireUrl);
      const currentRows = permissions.filter((row) => row.bidder_id === permissionBidderId);
      for (const row of currentRows) {
        if (!selectedProfileIds.has(row.resume_profile_id)) {
          const { error } = await supabase.from("bidder_profile_permissions").delete().eq("id", row.id);
          if (error) throw error;
        }
      }
      const currentIds = new Set(currentRows.map((row) => row.resume_profile_id));
      for (const profileId of selectedProfileIds) {
        if (!currentIds.has(profileId)) {
          const { error } = await supabase.from("bidder_profile_permissions").insert({
            bidder_id: permissionBidderId,
            resume_profile_id: profileId,
          });
          if (error) throw error;
        }
      }
      await refreshAll();
    });
  }

  function togglePermission(profileId) {
    setSelectedProfileIds((current) => {
      const next = new Set(current);
      if (next.has(profileId)) {
        next.delete(profileId);
      } else {
        next.add(profileId);
      }
      return next;
    });
  }

  function openLogViewer(log, type) {
    const isResume = type === "resume";
    const content = isResume ? log.resume_content : log.job_description_content;
    setLogViewer({
      title: `${isResume ? "Generated Resume" : "Job Description"} - ${logTitle(log)}`,
      content: content || "",
      emptyMessage: isResume ? "No generated resume content was saved for this log." : "No job description content was saved for this log.",
      downloadName: isResume
        ? safeDownloadName(log.resume_file_name || logTitle(log), "generated-resume")
        : safeDownloadName(`${log.company_name || "job"}-${log.job_title || "description"}-jd`, "job-description"),
    });
  }

  // The identifying fields first, then each employer, then the long job description.
  // jsonb does not preserve insertion order, so the useful order is imposed here.
  const SECTION_ORDER = ["COMPANY", "JOB TITLE", "ABOUT ME", "CORE SKILLS"];

  function bidSections(log) {
    const raw = log?.clipboard_sections;
    let parsed = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const entries = Object.entries(parsed).filter(([, value]) => String(value || "").trim());
    return entries.sort(([a], [b]) => {
      const rank = (name) => {
        const index = SECTION_ORDER.indexOf(name);
        if (index >= 0) return index;
        return name === "Job Description" ? SECTION_ORDER.length + 1 : SECTION_ORDER.length;
      };
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  }

  function openCopyViewer(log) {
    setCopiedSection("");
    setCopyViewer({ title: `Copy Sections - ${logTitle(log)}`, sections: bidSections(log) });
  }

  async function copySection(name, text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard access needs a secure context, so fall back to a temporary selection.
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopiedSection(name);
  }

  function downloadText(content, fileName) {
    const blob = new Blob([content || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadResume(log) {
    downloadText(log.resume_content || "", safeDownloadName(log.resume_file_name || logTitle(log), "generated-resume"));
  }

  // Resume Builder uploads the real .docx/.pdf, so pull the file itself out of private
  // storage rather than re-creating a text approximation of it.
  async function downloadStoredResume(storagePath, fallbackName) {
    await runRequest("Download started", async () => {
      const { data, error } = await supabase.storage.from(resumeBucket).download(storagePath);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = storagePath.split("/").pop() || fallbackName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return `Downloaded ${link.download}`;
    });
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>BMS Admin</h1>
          <p>Manage bidders, resume profiles, permissions, templates, and bid logs.</p>
        </div>
        <div className="actions">
          <span className={`status ${status.error ? "error" : ""}`}>{status.message}</span>
          <button onClick={() => runRequest("Loaded", refreshAll)}>Refresh</button>
        </div>
      </header>

      {!envConfigured && (
        <div className="env-warning">
          Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.
        </div>
      )}

      <nav className="tabs">
        {["bidders", "profiles", "permissions", "blocked", "logs"].map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
            {tab === "profiles" ? "Resume Profiles" : tab === "logs" ? "Bid Logs" : tab === "blocked" ? "Blocked Companies" : tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <main>
        <section className={`tab ${activeTab === "bidders" ? "active" : ""}`}>
          <div className="grid-two">
            <form className="panel form-grid" onSubmit={saveBidder}>
              <h2 className="span-all">Bidder</h2>
              <label>User ID <input value={bidderForm.user_id} onChange={(e) => updateBidder("user_id", e.target.value)} required /></label>
              <label>Password <input type="password" value={bidderForm.password} onChange={(e) => updateBidder("password", e.target.value)} placeholder="Leave blank to keep existing" /></label>
              <label>Name <input value={bidderForm.name} onChange={(e) => updateBidder("name", e.target.value)} /></label>
              <label>Role <select value={bidderForm.role} onChange={(e) => updateBidder("role", e.target.value)}><option>bidder</option><option>owner</option></select></label>
              <label>IP <input value={bidderForm.ip} onChange={(e) => updateBidder("ip", e.target.value)} /></label>
              <label>Country <input value={bidderForm.country} onChange={(e) => updateBidder("country", e.target.value)} /></label>
              <label>Job Site <input value={bidderForm.job_site} onChange={(e) => updateBidder("job_site", e.target.value)} placeholder="e.g. Dice" title="Recorded on every bid this bidder logs. Takes effect at their next sign-in." /></label>
              <label className="check span-all"><input type="checkbox" checked={bidderForm.active} onChange={(e) => updateBidder("active", e.target.checked)} /> Active</label>
              <fieldset className="choice-group span-all">
                <legend>Confirmation URL</legend>
                <label className="check"><input type="radio" name="bidder-confirm-url" checked={!bidderForm.require_confirmation_url} onChange={() => updateBidder("require_confirmation_url", false)} /> Optional — bidder can skip it</label>
                <label className="check"><input type="radio" name="bidder-confirm-url" checked={Boolean(bidderForm.require_confirmation_url)} onChange={() => updateBidder("require_confirmation_url", true)} /> Required — bid count waits for a URL</label>
              </fieldset>
              <div className="actions span-all">
                <button className="primary" type="submit">Save Bidder</button>
                <button type="button" onClick={() => setBidderForm(emptyBidder)}>Clear</button>
              </div>
            </form>

            <div className="panel">
              <h2>Bidders</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>User ID</th><th>Name</th><th>Role</th><th>IP</th><th>Country</th><th>Job Site</th><th>Active</th><th>Confirm URL</th><th></th></tr></thead>
                  <tbody>
                    {bidders.map((bidder) => (
                      <tr key={bidder.id}>
                        <td>{bidder.user_id}</td><td>{bidder.name}</td><td>{bidder.role}</td><td>{bidder.ip}</td><td>{bidder.country}</td><td>{bidder.job_site}</td><td>{bidder.active ? "Yes" : "No"}</td>
                        <td>{bidder.require_confirmation_url ? "Required" : "Optional"}</td>
                        <td>
                          <div className="row-actions">
                            <button onClick={() => setBidderForm({ ...emptyBidder, ...bidder, password: "" })}>Edit</button>
                            <button type="button" onClick={() => runRequest(bidder.require_confirmation_url ? "Confirmation URL is now optional" : "Confirmation URL is now required", async () => {
                              await saveBidderConfirmationRule(bidder.id, !bidder.require_confirmation_url);
                              await refreshAll();
                            })}>{bidder.require_confirmation_url ? "Make Optional" : "Make Required"}</button>
                            <button className="danger" onClick={() => deleteRow("bidders", bidder.id, "Bidder deleted")}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className={`tab ${activeTab === "profiles" ? "active" : ""}`}>
          <div className="grid-two">
            <form className="panel form-grid" onSubmit={saveProfile}>
              <h2 className="span-all">Resume Profile</h2>
              {profileFields.map(([key, label]) => (
                <label key={key}>{label}<input value={profileForm[key]} onChange={(e) => updateProfile(key, e.target.value)} /></label>
              ))}
              <label className="span-all">Education <textarea value={profileForm.education} onChange={(e) => updateProfile("education", e.target.value)} /></label>
              <label className="span-all">Resume Builder Logic <textarea value={profileForm.logic} onChange={(e) => updateProfile("logic", e.target.value)} placeholder="Extra instructions appended to every ChatGPT request for this profile" /></label>
              <label className="span-all">Resume Template (.docx)<input ref={profileFileInputRef} type="file" accept=".docx" onChange={(e) => setTemplateFile(e.target.files?.[0] || null)} /></label>
              <label className="span-all">Template File Name <input value={profileForm.template_file_name} onChange={(e) => updateProfile("template_file_name", e.target.value)} placeholder="Only used when no template is uploaded, e.g. 1.docx" /></label>
              <label className="span-all">Notes <textarea value={profileForm.notes} onChange={(e) => updateProfile("notes", e.target.value)} /></label>
              <label className="check span-all"><input type="checkbox" checked={profileForm.active} onChange={(e) => updateProfile("active", e.target.checked)} /> Active</label>
              <div className="actions span-all">
                <button className="primary" type="submit">Save Profile</button>
                <button type="button" onClick={clearProfileForm}>Clear</button>
              </div>
            </form>

            <div className="panel">
              <h2>Resume Profiles</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Profile</th><th>Email</th><th>Phone</th><th>Experience</th><th>Template</th><th>Active</th><th></th></tr></thead>
                  <tbody>
                    {profiles.map((profile) => (
                      <tr key={profile.id}>
                        <td>{profile.profile_name}</td><td>{profile.email}</td><td>{profile.phone}</td><td>{profile.experience}</td><td className="subtle">{profile.template_storage_path || "No template"}</td><td>{profile.active ? "Yes" : "No"}</td>
                        <td><div className="row-actions"><button onClick={() => setProfileForm({ ...emptyProfile, ...profile })}>Edit</button><button className="danger" onClick={() => deleteRow("resume_profiles", profile.id, "Profile deleted")}>Delete</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className={`tab ${activeTab === "permissions" ? "active" : ""}`}>
          <div className="panel">
            <h2>Bidder Profile Permissions</h2>
            <div className="permission-row">
              <select value={permissionBidderId} onChange={(e) => setPermissionBidderId(e.target.value)}>
                {bidders.map((bidder) => <option key={bidder.id} value={bidder.id}>{bidder.user_id} - {bidder.name}{bidder.require_confirmation_url ? " — URL required" : " — URL optional"}</option>)}
              </select>
              <button className="primary" onClick={savePermissions}>Save Permissions</button>
            </div>
            <fieldset className="choice-group">
              <legend>Confirmation URL for this bidder</legend>
              <label className="check"><input type="radio" name="permission-confirm-url" checked={!permissionRequireUrl} onChange={() => setPermissionRequireUrl(false)} /> Optional — bids count after generate</label>
              <label className="check"><input type="radio" name="permission-confirm-url" checked={permissionRequireUrl} onChange={() => setPermissionRequireUrl(true)} /> Required — bids do not count until a confirmation URL is entered</label>
            </fieldset>
            <div className="checks">
              {profiles.map((profile) => (
                <label className="check" key={profile.id}>
                  <input type="checkbox" checked={selectedProfileIds.has(profile.id)} onChange={() => togglePermission(profile.id)} />
                  {profile.profile_name}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className={`tab ${activeTab === "blocked" ? "active" : ""}`}>
          <div className="grid-two">
            <form className="panel form-grid" onSubmit={saveBlockedCompany}>
              <h2 className="span-all">Blocked Company</h2>
              <label className="span-all">Company <input value={blockedForm.company_name} onChange={(e) => updateBlockedCompany("company_name", e.target.value)} /></label>
              <label className="span-all">Reason <textarea value={blockedForm.reason} onChange={(e) => updateBlockedCompany("reason", e.target.value)} /></label>
              <label className="check span-all"><input type="checkbox" checked={blockedForm.active} onChange={(e) => updateBlockedCompany("active", e.target.checked)} /> Active</label>
              <div className="actions span-all">
                <button className="primary" type="submit">Save Block</button>
                <button type="button" onClick={() => setBlockedForm(emptyBlockedCompany)}>Clear</button>
              </div>
            </form>

            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Blocked Companies</h2>
                  <p>Active companies are blocked in Resume Builder before resume generation.</p>
                </div>
                <span className="page-summary">
                  {blockedTotal ? `Showing ${blockedFirstRow}-${blockedLastRow} of ${blockedTotal}` : "No blocked companies"}
                </span>
              </div>
              <div className="filters">
                <input value={blockedSearch} onChange={(e) => { setBlockedPage(0); setBlockedSearch(e.target.value); }} placeholder="Search company or reason..." />
                <button type="button" onClick={() => setBlockedPage(0)} disabled={blockedPage <= 0}>First</button>
                <button type="button" onClick={() => setBlockedPage((page) => Math.max(0, page - 1))} disabled={blockedPage <= 0}>Prev</button>
                <span className="pagination-status">Page {blockedPage + 1} of {blockedPageCount}</span>
                <button type="button" onClick={() => setBlockedPage((page) => Math.min(blockedPageCount - 1, page + 1))} disabled={blockedPage >= blockedPageCount - 1}>Next</button>
                <button type="button" onClick={() => setBlockedPage(blockedPageCount - 1)} disabled={blockedPage >= blockedPageCount - 1}>Last</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Company</th><th>Reason</th><th>Active</th><th></th></tr></thead>
                  <tbody>
                    {blockedCompanies.map((company) => (
                      <tr key={company.id}>
                        <td>{company.company_name}</td>
                        <td>{company.reason}</td>
                        <td>{company.active ? "Yes" : "No"}</td>
                        <td><div className="row-actions"><button onClick={() => setBlockedForm({ ...emptyBlockedCompany, ...company })}>Edit</button><button className="danger" onClick={() => deleteRow("blocked_companies", company.id, "Blocked company deleted")}>Delete</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className={`tab ${activeTab === "logs" ? "active" : ""}`}>
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>Bid Logs</h2>
                <p>Times shown in {logTimeZoneLabel}.</p>
              </div>
              <span className="page-summary">
                {logTotal ? `Showing ${logFirstRow}-${logLastRow} of ${logTotal}` : "No logs"}
              </span>
            </div>
            <div className="filters">
              <input value={logSearch} onChange={(e) => { setLogPage(0); setLogSearch(e.target.value); }} placeholder="Search company, title, bidder, profile..." />
              <select value={logSort} onChange={(e) => { setLogPage(0); setLogSort(e.target.value); }}>
                <option value="created_at.desc">Newest</option>
                <option value="created_at.asc">Oldest</option>
                <option value="company_name.asc">Company A-Z</option>
                <option value="profile_name.asc">Profile A-Z</option>
                <option value="bidder_user_id.asc">Bidder A-Z</option>
              </select>
              <button type="button" onClick={() => setLogPage(0)} disabled={logPage <= 0}>First</button>
              <button type="button" onClick={() => setLogPage((page) => Math.max(0, page - 1))} disabled={logPage <= 0}>Prev</button>
              <span className="pagination-status">Page {logPage + 1} of {logPageCount}</span>
              <button type="button" onClick={() => setLogPage((page) => Math.min(logPageCount - 1, page + 1))} disabled={logPage >= logPageCount - 1}>Next</button>
              <button type="button" onClick={() => setLogPage(logPageCount - 1)} disabled={logPage >= logPageCount - 1}>Last</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Time ({logTimeZoneLabel})</th><th>Bidder</th><th>Profile</th><th>Company</th><th>Title</th><th>Site</th><th>Confirm URL</th><th>JD Preview</th><th>Actions</th></tr></thead>
                <tbody>
                  {logs.map((log) => {
                    const confirmHref = confirmationHref(log.confirmation_url);
                    return (
                    <tr key={log.id}>
                      <td>{formatLogTime(log.created_at, logTimeZone)}</td>
                      <td>{log.bidder_user_id || log.bidder_name}</td>
                      <td>{log.profile_name}</td>
                      <td>{log.company_name}</td>
                      <td>{log.job_title}</td>
                      <td>{log.job_site}</td>
                      <td>
                        {confirmHref ? (
                          <a href={confirmHref} target="_blank" rel="noreferrer">{log.confirmation_url}</a>
                        ) : log.confirmation_url ? (
                          <span>{log.confirmation_url}</span>
                        ) : (
                          <span className="subtle">None</span>
                        )}
                      </td>
                      <td>{(log.job_description_content || "").slice(0, 180)}</td>
                      <td>
                        <div className="log-actions">
                          <button type="button" onClick={() => openLogViewer(log, "jd")} disabled={!log.job_description_content}>View JD</button>
                          <button type="button" onClick={() => openLogViewer(log, "resume")} disabled={!log.resume_content}>View Resume</button>
                          <button type="button" onClick={() => openCopyViewer(log)} disabled={!bidSections(log).length}>Copy</button>
                          <button type="button" className="primary" onClick={() => downloadStoredResume(log.resume_storage_path, "resume.docx")} disabled={!log.resume_storage_path}>DOCX</button>
                          <button type="button" onClick={() => downloadStoredResume(log.resume_pdf_storage_path, "resume.pdf")} disabled={!log.resume_pdf_storage_path}>PDF</button>
                          <button type="button" onClick={() => downloadResume(log)} disabled={!log.resume_content}>Text</button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {logViewer && (
        <div className="modal-backdrop" role="presentation" onClick={() => setLogViewer(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-label={logViewer.title} onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h2>{logViewer.title}</h2>
              <div className="modal-actions">
                <button type="button" onClick={() => downloadText(logViewer.content, logViewer.downloadName)} disabled={!logViewer.content}>Download</button>
                <button type="button" onClick={() => setLogViewer(null)}>Close</button>
              </div>
            </header>
            <pre className="document-view">{logViewer.content || logViewer.emptyMessage}</pre>
          </section>
        </div>
      )}

      {copyViewer && (
        <div className="modal-backdrop" role="presentation" onClick={() => setCopyViewer(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-label={copyViewer.title} onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h2>{copyViewer.title}</h2>
              <div className="modal-actions">
                <button type="button" onClick={() => setCopyViewer(null)}>Close</button>
              </div>
            </header>
            <div className="copy-sections">
              {copyViewer.sections.length === 0 ? (
                <p className="subtle">No copy sections were saved for this bid.</p>
              ) : copyViewer.sections.map(([name, value]) => (
                <article className="copy-section" key={name}>
                  <div className="copy-section-header">
                    <h3>{name}</h3>
                    <button type="button" onClick={() => copySection(name, String(value))}>
                      {copiedSection === name ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre>{String(value)}</pre>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
