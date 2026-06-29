import React, { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import { BarChart, Bar, XAxis, Tooltip, PieChart, Pie, Cell, ResponsiveContainer, LabelList } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const BASE_URL = 'http://127.0.0.1:5000'; 
const API_BASE = `${BASE_URL}/api`;
const socket = io(BASE_URL);

// Expanded Translation Dictionary
const TRANSLATIONS = {
  en: { dashboard: "Dashboard", feed: "Local Feed", track: "Track", profile: "Profile", report: "Report", verify: "Verify", verified: "Verified", lang: "Language", phone: "Contact Number", pass: "Password", confirmPass: "Confirm Password", username: "Username", fullname: "Full Name", address: "Address / Zone", loginBtn: "Login", regBtn: "Register New" },
  hi: { dashboard: "डैशबोर्ड", feed: "स्थानीय फ़ीड", track: "ट्रैक", profile: "प्रोफ़ाइल", report: "रिपोर्ट", verify: "सत्यापित करें", verified: "सत्यापित", lang: "भाषा", phone: "संपर्क नंबर", pass: "पासवर्ड", confirmPass: "पासवर्ड की पुष्टि करें", username: "उपयोगकर्ता नाम", fullname: "पूरा नाम", address: "पता / क्षेत्र", loginBtn: "लॉगिन", regBtn: "पंजीकरण" },
  mr: { dashboard: "डॅशबोर्ड", feed: "स्थानिक फीड", track: "मागोवा", profile: "प्रोफाइल", report: "अहवाल", verify: "पडताळणी करा", verified: "सत्यापित", lang: "भाषा", phone: "संपर्क क्रमांक", pass: "पासवर्ड", confirmPass: "पासवर्ड पुष्टी करा", username: "वापरकर्तानाव", fullname: "पूर्ण नाव", address: "पत्ता / क्षेत्र", loginBtn: "लॉगिन करा", regBtn: "नोंदणी करा" }
};

const RANK_ICONS = { "Observer": "👁️", "Scout": "🦅", "Operative": "🕵️", "Vanguard": "⚡", "Legend": "👑" };
const RANKS_INFO = [
  { name: "Observer", xp: 0, icon: "👁️" }, { name: "Scout", xp: 100, icon: "🦅" },
  { name: "Operative", xp: 500, icon: "🕵️" }, { name: "Vanguard", xp: 1000, icon: "⚡" }, { name: "Legend", xp: 2500, icon: "👑" }
];
const BADGES_INFO = [
  { name: "Tactical Spotter", icon: "🎯", xp: "+250 XP", desc: "Report 5 High Severity issues that get resolved by the city." },
  { name: "Night Owl", icon: "🦉", xp: "+100 XP", desc: "Submit 3 live reports between 12 AM and 4 AM that get resolved." },
  { name: "The Rizzler of Roads", icon: "🛣️", xp: "+150 XP", desc: "Write a perfect description for a hazard that gets fast-tracked." },
  { name: "Map Explorer", icon: "🗺️", xp: "+300 XP", desc: "Secure grids across 3 distinct zones/cities." }
];

const getMarkerIcon = (status) => {
  let colorClass = status === 'Resolved' ? 'bg-emerald-500' : status === 'In Progress' ? 'bg-yellow-500' : 'bg-red-500';
  return L.divIcon({ className: 'custom-icon', html: `<div class="w-4 h-4 rounded-full ${colorClass} border-2 border-white shadow-md"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
};

const AdminIssueListCard = ({ issue, onSelect }) => (
  <div onClick={() => onSelect(issue.id)} className="bg-slate-900 rounded-xl p-4 border border-slate-700 shadow-sm flex justify-between items-center cursor-pointer hover:bg-slate-800 hover:border-purple-500/50 transition-all mb-3 group">
    <div className="flex gap-4 items-center">
        <span className="text-slate-400 font-bold bg-slate-950 px-2 py-1 rounded text-xs border border-slate-800">#{issue.id}</span>
        <span className="text-purple-400 font-bold truncate max-w-[150px] md:max-w-xs flex items-center gap-2">
            {issue.category}
            <span className="text-[10px]" title={issue.is_live ? "Live Capture" : "Uploaded File"}>{issue.is_live ? '🔴' : '📁'}</span>
        </span>
    </div>
    <div className="flex gap-3 items-center">
        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase hidden md:inline-block ${issue.severity === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{issue.severity}</span>
        <span className={`text-xs font-bold uppercase tracking-wider ${issue.status === 'Resolved' ? 'text-emerald-500' : issue.status === 'Rejected' ? 'text-red-500' : 'text-slate-300'}`}>{issue.status}</span>
        <span className="text-slate-500 text-xs ml-2 group-hover:text-purple-400 transition-colors">▶</span>
    </div>
  </div>
);

const AdminIssueDetail = ({ issueId, adminIssues, onBack, onStatusUpdate }) => {
  const issue = adminIssues.find(i => i.id === issueId);
  const [currentStatus, setCurrentStatus] = useState(issue?.status || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => { if (issue) setCurrentStatus(issue.status); }, [issue?.status]);

  if (!issue) return <div className="text-slate-400 text-center py-10">Issue not found. <button onClick={onBack} className="text-purple-400 underline ml-2">Go back</button></div>;

  const handleUpdate = async () => { setIsUpdating(true); await onStatusUpdate(issue.id, currentStatus); setIsUpdating(false); };
  
  const handleBlockUser = async () => {
    if(!window.confirm(`Are you sure you want to block ${issue.reporter_name || 'this user'}? They will no longer be able to submit reports.`)) return;
    const token = sessionStorage.getItem('admin_token');
    try { await fetch(`${API_BASE}/admin/block`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ contact_no: issue.reporter_contact, is_blocked: true }) }); alert('User blocked successfully.'); } catch(err) {}
  };

  const handleGetInsights = async () => {
    const token = sessionStorage.getItem('admin_token');
    if (!token) return;
    setLoadingInsights(true);
    try {
      const res = await fetch(`${API_BASE}/admin/predict_issue/${issue.id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setInsights(data.insights);
    } catch (err) {}
    setLoadingInsights(false);
  };

  const isVideo = issue.media_url && (issue.media_url.includes('video/webm') || issue.media_url.includes('video/mp4'));

  return (
    <div className="flex flex-col gap-5 animate-fade-in pb-10">
      <div className="flex justify-between items-center border-b border-slate-700 pb-4">
        <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-sm font-bold text-slate-400 hover:text-white px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg transition-colors">← Back</button>
            <h3 className="text-xl font-bold text-purple-400 hidden md:block">Issue #{issue.id}</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right border-r border-slate-700 pr-3">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Reported By</div>
            <div className="text-sm font-bold text-slate-200">{issue.reporter_name || 'Unknown User'}</div>
            <div className="text-xs text-emerald-400 font-mono mt-0.5">📞 {issue.reporter_contact || 'Hidden'}</div>
          </div>
          <button onClick={handleBlockUser} className="px-3 py-2 bg-red-900/50 hover:bg-red-800 text-red-300 text-xs font-bold rounded-lg border border-red-500/30">🚫 Block</button>
        </div>
      </div>

      {issue.media_url && (
        <div className="w-full bg-black rounded-xl overflow-hidden border border-slate-700 shadow-lg">
          {isVideo ? <video src={issue.media_url} controls className="w-full max-h-[400px] object-contain" /> : <img src={issue.media_url} alt="Reported issue" className="w-full max-h-[400px] object-contain" />}
        </div>
      )}

      <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 shadow-sm">
        <div className="flex justify-between items-start mb-5">
            <div>
                <h3 className="text-xl font-bold text-slate-100 leading-tight">{issue.category}</h3>
                <p className="text-sm text-slate-400 mt-2">Verified by <strong className="text-white">{issue.upvotes || 0}</strong> local citizens</p>
            </div>
            <div className="flex flex-col gap-2 items-end">
                <span className={`px-3 py-1 rounded text-xs font-bold uppercase ${issue.severity === 'High' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'}`}>{issue.severity}</span>
                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${issue.is_live ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>{issue.is_live ? '🔴 Live Capture' : '📁 Uploaded File'}</span>
            </div>
        </div>
        
        <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 shadow-inner">
          <p className="text-base text-slate-300 whitespace-pre-line leading-relaxed">{issue.description}</p>
          {issue.address && <p className="text-sm text-slate-400 flex items-center gap-2 mt-4 pt-4 border-t border-slate-800">📍 {issue.address} {issue.city ? `(${issue.city})` : ''}</p>}
        </div>
        
        <div className="flex gap-3 items-center pt-5 mt-4 border-t border-slate-800">
          <select value={currentStatus} onChange={(e) => setCurrentStatus(e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 text-white rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500 font-bold">
            <option value="Under Review">Under Review</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <button onClick={handleUpdate} disabled={isUpdating || currentStatus === issue.status} className={`px-6 py-3 rounded-lg font-bold text-sm transition-all ${isUpdating || currentStatus === issue.status ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-purple-500 hover:bg-purple-600 text-slate-900 shadow-lg shadow-purple-500/20'}`}>
            {isUpdating ? 'Saving...' : 'Update'}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 p-6 rounded-xl border border-purple-500/30 shadow-sm">
          {!insights && !loadingInsights ? (
              <button onClick={handleGetInsights} className="w-full py-4 bg-purple-900/30 hover:bg-purple-900/50 border border-purple-500/50 text-purple-300 text-base font-bold rounded-lg transition-colors flex items-center justify-center gap-2">✨ Generate Predictive Insights</button>
          ) : loadingInsights ? (
              <div className="text-base text-purple-400 font-bold animate-pulse text-center py-4 bg-purple-950/20 rounded-lg border border-purple-900/50">Analyzing imagery and metadata...</div>
          ) : (
              <div className="bg-slate-950 p-6 rounded-lg border border-purple-900/50 shadow-inner"><h4 className="text-base font-bold text-purple-400 mb-4 flex items-center gap-2">✨ AI Predictive Insights</h4><div className="text-base text-slate-300 whitespace-pre-line leading-relaxed">{insights}</div></div>
          )}
      </div>
    </div>
  );
};


function App() {
  const [currentView, setCurrentView] = useState(localStorage.getItem('app_view') || 'home');
  const [citizenTab, setCitizenTab] = useState(sessionStorage.getItem('app_citizen_tab') || 'impact'); 
  const [adminTab, setAdminTab] = useState(sessionStorage.getItem('app_admin_tab') || 'dashboard'); 
  const [selectedAdminIssueId, setSelectedAdminIssueId] = useState(null); 
  const [adminProfileSection, setAdminProfileSection] = useState(null); 

  // --- IDENTITY & REGISTRATION ---
  const [contactNo, setContactNo] = useState(localStorage.getItem('user_contact') || '');
  const [authMode, setAuthMode] = useState('login'); 
  const [password, setPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [regForm, setRegForm] = useState({ name: '', address: '', language: 'en', username: '', confirmPassword: '' });
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  
  // Global Language Logic
  const [userLang, setUserLang] = useState(localStorage.getItem('user_lang') || 'en');
  const t = (key) => TRANSLATIONS[userLang]?.[key] || TRANSLATIONS['en'][key] || key;

  const [showTutorial, setShowTutorial] = useState(!localStorage.getItem('tutorialDone'));
  
  // --- PROFILE & NOTIFICATIONS ---
  const [userProfile, setUserProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifPanelRef = useRef(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileForm, setEditProfileForm] = useState({ name: '', address: '', language: 'en' });
  const [showRanksGuide, setShowRanksGuide] = useState(false);
  const [showBadgesGuide, setShowBadgesGuide] = useState(false);
  const [problemForm, setProblemForm] = useState("");
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [appProblems, setAppProblems] = useState([]);

  // --- PUBLIC & ADMIN ANALYTICS ---
  const [publicAnalytics, setPublicAnalytics] = useState(null);
  const [adminPerformance, setAdminPerformance] = useState(null);
  const [adminProfileData, setAdminProfileData] = useState(null);
  const [superAdminStats, setSuperAdminStats] = useState([]);
  const [selectedSuperAdminId, setSelectedSuperAdminId] = useState(null);
  const [publicAnalyticsError, setPublicAnalyticsError] = useState(null); 

  // --- LOCATION & FEED STATE ---
  const [userLat, setUserLat] = useState(null);
  const [userLng, setUserLng] = useState(null);
  const [address, setAddress] = useState(''); 
  const [userCity, setUserCity] = useState('Unknown');
  const [locationError, setLocationError] = useState(null);
  const [feedIssues, setFeedIssues] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [verifyingIds, setVerifyingIds] = useState([]);

  // --- REPORTING STATE ---
  const [mediaFile, setMediaFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState(null);
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // --- TRACKING & RATING STATE ---
  const [myIssues, setMyIssues] = useState([]);
  const [trackId, setTrackId] = useState('');
  const [trackResult, setTrackResult] = useState(null);
  const [trackError, setTrackError] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [ratingVal, setRatingVal] = useState(0);

  // --- ADMIN STATE ---
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminRequiresForce, setAdminRequiresForce] = useState(false);
  const [adminLocating, setAdminLocating] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState(null);
  const [adminIssues, setAdminIssues] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState(null);
  const [adminSearchId, setAdminSearchId] = useState(''); 
  const [currentAdminRole, setCurrentAdminRole] = useState(sessionStorage.getItem('admin_role') || 'local_admin');
  const [currentAdminName, setCurrentAdminName] = useState(sessionStorage.getItem('admin_name') || '');
  const [currentAdminCity, setCurrentAdminCity] = useState(sessionStorage.getItem('admin_city') || '');
  const [systemAdmins, setSystemAdmins] = useState([]);
  const [adminForm, setAdminForm] = useState({ id: null, username: '', password: '', assigned_city: '', role: 'local_admin' });
  const [isEditingAdmin, setIsEditingAdmin] = useState(false);
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);

  // --- AUTO-SAVE STATE ---
  useEffect(() => {
     if (!['home', 'citizen_login', 'citizen', 'admin_login', 'admin'].includes(currentView)) { setCurrentView('home'); }
     localStorage.setItem('app_view', currentView); 
  }, [currentView]);
  useEffect(() => { sessionStorage.setItem('app_citizen_tab', citizenTab); }, [citizenTab]);
  useEffect(() => { sessionStorage.setItem('app_admin_tab', adminTab); }, [adminTab]);

  useEffect(() => {
    if (currentView === 'citizen' && (!contactNo || contactNo.length !== 10)) setCurrentView('citizen_login');
    if (currentView === 'admin' && !sessionStorage.getItem('admin_token')) setCurrentView('admin_login');
  }, [currentView, contactNo]);

  // Username validation Debouncer
  useEffect(() => {
    if (authMode === 'register' && regForm.username?.length > 2) {
        const delay = setTimeout(async () => {
            try {
                const res = await fetch(`${API_BASE}/citizen/check_username?username=${regForm.username}`);
                const data = await res.json();
                setUsernameAvailable(data.available);
            } catch(e){}
        }, 500);
        return () => clearTimeout(delay);
    } else {
        setUsernameAvailable(null);
    }
  }, [regForm.username, authMode]);

  useEffect(() => {
    const handleClickOutside = (event) => { if (notifPanelRef.current && !notifPanelRef.current.contains(event.target)) setShowNotifs(false); };
    if (showNotifs) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifs]);

  useEffect(() => {
    const handleUnload = () => {
      const token = sessionStorage.getItem('admin_token');
      if (token) {
        fetch(`${API_BASE}/admin/logout`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${token}` 
          },
          keepalive: true,
          body: JSON.stringify({})
        }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // --- DATA LOADERS ---
  const loadPublicAnalytics = (cityOverride) => {
    let url = `${API_BASE}/public/analytics`;
    
    // Determine City Context
    if (currentView === 'admin' && currentAdminRole !== 'super_admin' && currentAdminCity) {
        url += `?city=${encodeURIComponent(currentAdminCity)}`;
    } else if (currentView === 'citizen') {
        const targetCity = cityOverride || userCity;
        if (targetCity && targetCity !== 'Unknown') {
            url += `?city=${encodeURIComponent(targetCity)}`;
        }
    }

    fetch(url).then(async (res) => {
         const data = await res.json();
         if (!res.ok) throw new Error(data.error);
         return data;
      }).then(data => setPublicAnalytics(data)).catch(err => { setPublicAnalyticsError(err.message); });
  };

  const loadUserProfile = async () => {
      if(!contactNo) return;
      try {
          const res = await fetch(`${API_BASE}/citizen/profile?contact_no=${contactNo}`);
          if(res.ok) {
            const data = await res.json(); 
            setUserProfile(data); 
            setUserLang(data.language || 'en');
            localStorage.setItem('user_lang', data.language || 'en');
            setEditProfileForm({ name: data.name, address: data.address, language: data.language || 'en' });
          } else if (res.status === 404) {
             localStorage.removeItem('user_contact'); setContactNo(''); setCurrentView('citizen_login');
          }
      } catch(e) {}
  };

  const loadNotifications = async (isAdmin = false) => {
      try {
          const endpoint = isAdmin ? `${API_BASE}/notifications?username=${currentAdminName}` : `${API_BASE}/notifications?contact_no=${contactNo}`;
          const res = await fetch(endpoint);
          if(res.ok) { const data = await res.json(); setNotifications(data.notifications || []); }
      } catch(e) {}
  };

  const loadProblems = async (isAdmin = false) => {
      try {
          const role = isAdmin ? currentAdminRole : 'citizen';
          const res = await fetch(`${API_BASE}/bugs?role=${role}`);
          if(res.ok) { const data = await res.json(); setAppProblems(data.bugs || []); }
      } catch(e) {}
  };

  const markNotificationsRead = async (isAdmin = false) => {
      try {
          const payload = isAdmin ? { username: currentAdminName } : { contact_no: contactNo };
          await fetch(`${API_BASE}/notifications`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)});
          if(!isAdmin) loadUserProfile(); 
          loadNotifications(isAdmin);
      } catch(e) {}
  };

  useEffect(() => {
    if (currentView === 'citizen' && contactNo) { 
      loadUserProfile(); loadNotifications(false); loadCitizenFeed(); 
    }
    if (currentView === 'admin' && sessionStorage.getItem('admin_token')) {
      loadPublicAnalytics(); loadAdminDashboardData(); loadNotifications(true); loadProblems(true);
    }
  }, [currentView]);

  useEffect(() => {
      if (citizenTab === 'notifications' || adminTab === 'notifications') {
          markNotificationsRead(currentView === 'admin');
      }
  }, [citizenTab, adminTab, currentView]);

  const loadAdminDashboardData = async () => {
      const token = sessionStorage.getItem('admin_token'); 
      if (!token) return;
      setAdminLoading(true);
      try {
          const [issuesRes, perfRes, profRes] = await Promise.all([
              fetch(`${API_BASE}/admin/issues`, { headers: { 'Authorization': `Bearer ${token}` } }),
              fetch(`${API_BASE}/admin/performance`, { headers: { 'Authorization': `Bearer ${token}` } }),
              fetch(`${API_BASE}/admin/profile_data`, { headers: { 'Authorization': `Bearer ${token}` } })
          ]);
          
          if(issuesRes.status === 401 || perfRes.status === 401 || profRes.status === 401) { 
              alert("Session terminated. You have been logged out because your account was accessed from another device.");
              setCurrentView('admin_login'); 
              sessionStorage.clear(); 
              return; 
          }
          
          if (issuesRes.ok) setAdminIssues((await issuesRes.json()).issues || []);
          if (perfRes.ok) setAdminPerformance(await perfRes.json());
          if (profRes.ok) setAdminProfileData(await profRes.json());
      } catch(e) {}
      setAdminLoading(false);
  };

  const loadSuperAdminStats = async () => {
      const token = sessionStorage.getItem('admin_token');
      try {
          const res = await fetch(`${API_BASE}/superadmin/admins_stats`, { headers: { 'Authorization': `Bearer ${token}` } });
          if(res.ok) { const data = await res.json(); setSuperAdminStats(data.stats || []); }
      } catch(e) {}
  };

  useEffect(() => {
      if (currentAdminRole === 'super_admin' && adminTab === 'real_time_report') {
          loadSuperAdminStats();
      }
  }, [adminTab, currentAdminRole]);

  // Track Tab My Issues Loader
  useEffect(() => {
    if (citizenTab === 'track' && contactNo) {
        fetch(`${API_BASE}/citizen/my_issues?contact_no=${contactNo}`).then(res => res.json()).then(data => setMyIssues(data.issues || []));
        setTrackResult(null); 
    }
  }, [citizenTab, contactNo]);

  // --- WEBSOCKETS ---
  useEffect(() => {
    const triggerSilentAdminSync = () => { if (sessionStorage.getItem('admin_token')) loadAdminDashboardData(); };

    socket.on('new_issue', (newIssue) => {
      setFeedIssues((prev) => [newIssue, ...(prev || [])]);
      loadPublicAnalytics(); triggerSilentAdminSync(); 
    });
    
    socket.on('status_update', (data) => {
      setFeedIssues((prev) => {
        if (data.status === 'Resolved' || data.status === 'Rejected') return (prev || []).filter(issue => issue.id !== data.issue_id);
        return (prev || []).map(issue => issue.id === data.issue_id ? { ...issue, status: data.status } : issue);
      });
      setMyIssues((prev) => (prev || []).map(issue => issue.id === data.issue_id ? { ...issue, status: data.status } : issue));
      setTrackResult((prev) => prev?.id === data.issue_id ? { ...prev, status: data.status } : prev);

      loadPublicAnalytics(); triggerSilentAdminSync(); 
    });

    socket.on('upvote_update', (data) => {
      setFeedIssues((prev) => (prev || []).map(issue => issue.id === data.issue_id ? { ...issue, upvotes: data.upvotes } : issue));
      loadPublicAnalytics(); triggerSilentAdminSync(); 
    });

    socket.on('new_notification', (data) => {
        if(currentView === 'citizen' && contactNo && data.contact_no === contactNo) {
            loadNotifications(false); loadUserProfile(); 
        }
    });

    socket.on('admin_notification', (data) => {
        if(currentView === 'admin' && currentAdminName && data.username === currentAdminName) {
            loadNotifications(true); 
        }
    });

    return () => { socket.off('new_issue'); socket.off('status_update'); socket.off('upvote_update'); socket.off('new_notification'); socket.off('admin_notification'); };
  }, [contactNo, currentView, currentAdminName]); 

  // --- CITIZEN AUTH ---
  const handleCitizenAuth = async (e) => {
      e.preventDefault();
      if (contactNo.length !== 10) return alert("Please enter exactly 10 digits."); 
      if (!password) return alert("Password is required.");

      if (authMode === 'register') {
          if (password !== regForm.confirmPassword) return alert("Passwords do not match!");
          if (usernameAvailable === false) return alert("Please pick an available username.");
      }

      setIsAuthLoading(true);
      
      try {
          if (authMode === 'login') {
              const res = await fetch(`${API_BASE}/citizen/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({contact_no: contactNo, password, language: regForm.language})});
              const data = await res.json();
              if(!res.ok) { alert(data.error); setIsAuthLoading(false); return; }
              localStorage.setItem('user_contact', contactNo);
              setUserLang(data.language || 'en');
              localStorage.setItem('user_lang', data.language || 'en');
              setCurrentView('citizen'); setCitizenTab('impact'); 
          } else {
              const regRes = await fetch(`${API_BASE}/citizen/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({contact_no: contactNo, password, name: regForm.name, address: regForm.address, language: regForm.language, username: regForm.username})});
              if(regRes.ok) {
                  localStorage.setItem('user_contact', contactNo);
                  setUserLang(regForm.language);
                  localStorage.setItem('user_lang', regForm.language);
                  setCurrentView('citizen'); setCitizenTab('impact'); 
              } else {
                  const regData = await regRes.json();
                  alert(regData.error || "Failed to register.");
              }
          }
      } catch(e) { alert("Server error."); }
      finally { setIsAuthLoading(false); }
  };

  const handleProfileUpdate = async (e) => {
      e.preventDefault();
      try {
          const res = await fetch(`${API_BASE}/citizen/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_no: contactNo, name: editProfileForm.name, address: editProfileForm.address, language: editProfileForm.language }) });
          if(res.ok) { setIsEditingProfile(false); loadUserProfile(); setUserLang(editProfileForm.language); localStorage.setItem('user_lang', editProfileForm.language); } else { alert("Failed to update profile."); }
      } catch(err) { alert("Server error"); }
  };

  const handleCitizenLogout = () => {
      if(window.confirm("Are you sure you want to log out?")) {
          localStorage.removeItem('user_contact'); setContactNo(''); setPassword(''); setCurrentView('home');
      }
  };

  const submitProblem = async (e) => {
      e.preventDefault();
      try {
          const role = currentView === 'admin' ? currentAdminRole : 'citizen';
          const reporter_id = currentView === 'admin' ? currentAdminName : contactNo;
          const res = await fetch(`${API_BASE}/bugs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reporter_id, reporter_role: role, description: problemForm }) });
          if(res.ok) { alert("Issue reported. Thank you."); setProblemForm(""); setShowProblemModal(false); }
      } catch(err) { alert("Failed to report."); }
  };

  // --- LOCATION & FEED ---
  const loadCitizenFeed = () => {
    setFeedLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude; const lng = position.coords.longitude;
          setUserLat(lat); setUserLng(lng);
          let cityExtracted = "Unknown";
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            if (data && data.display_name) {
              setAddress(data.display_name);
              cityExtracted = data.address.city || data.address.town || data.address.village || data.address.state_district || "Unknown";
              setUserCity(cityExtracted);
            }
          } catch (e) {}
          fetchNearbyIssues(lat, lng, cityExtracted);
          loadPublicAnalytics(cityExtracted);
        },
        (err) => { setLocationError("Location denied. Showing local territory issues."); fetchNearbyIssues(null, null, userCity); loadPublicAnalytics(); }
      );
    } else { fetchNearbyIssues(null, null, userCity); loadPublicAnalytics(); }
  };

  const fetchNearbyIssues = async (lat, lng, cityParam = userCity) => {
    try {
      let url = `${API_BASE}/issues/nearby?contact_no=${contactNo}&city=${encodeURIComponent(cityParam)}`;
      if (lat && lng) url += `&lat=${lat}&lng=${lng}`;
      const response = await fetch(url);
      const data = await response.json();
      if (response.ok) setFeedIssues(data.issues || []);
    } catch (err) { setLocationError("Could not connect to server to fetch feed."); }
    setFeedLoading(false);
  };

  const handleVerifyIssue = async (issueId) => {
    if(verifyingIds.includes(issueId)) return;
    setVerifyingIds(prev => [...prev, issueId]);

    const targetIssue = feedIssues.find(i => i.id === issueId);
    if (!targetIssue) { setVerifyingIds(prev => prev.filter(id => id !== issueId)); return; }
    
    const isNowVoted = !targetIssue.has_voted;
    const newUpvotes = isNowVoted ? targetIssue.upvotes + 1 : targetIssue.upvotes - 1;
    setFeedIssues(prev => (prev || []).map(issue => issue.id === issueId ? { ...issue, has_voted: isNowVoted, upvotes: newUpvotes } : issue));
    
    try {
      const response = await fetch(`${API_BASE}/issues/${issueId}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_no: contactNo }) });
      if (!response.ok) {
        const errorData = await response.json(); alert(errorData.error || "Failed to verify");
        setFeedIssues(prev => (prev || []).map(issue => issue.id === issueId ? { ...issue, has_voted: targetIssue.has_voted, upvotes: targetIssue.upvotes } : issue));
      }
    } catch (err) { setFeedIssues(prev => (prev || []).map(issue => issue.id === issueId ? { ...issue, has_voted: targetIssue.has_voted, upvotes: targetIssue.upvotes } : issue)); } 
    finally { setVerifyingIds(prev => prev.filter(id => id !== issueId)); }
  };

  // --- CAMERA ---
  const startCamera = async () => {
    resetReportState();
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: true });
      setStream(mediaStream); setIsCameraActive(true);
      if (videoRef.current) { videoRef.current.srcObject = mediaStream; videoRef.current.play().catch(e => console.error(e)); }
    } catch (err) { setError(`Camera Error: Ensure permissions are granted.`); }
  };
  const stopCamera = () => {
    if (stream) { stream.getTracks().forEach(track => track.stop()); setStream(null); }
    setIsCameraActive(false); setIsRecording(false);
  };
  useEffect(() => { return () => { if (stream) stream.getTracks().forEach(track => track.stop()); }; }, [stream]);
  const resetReportState = () => { setError(null); setResult(null); setMediaFile(null); setPreview(null); setMediaType(null); setAiDraft(null); setAdditionalNotes(""); };

  const requestLocationForReport = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const lat = position.coords.latitude; const lng = position.coords.longitude;
            setUserLat(lat); setUserLng(lng);
            let cityExtracted = "Unknown";
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
              const data = await res.json();
              if (data && data.display_name) {
                setAddress(data.display_name);
                cityExtracted = data.address.city || data.address.town || data.address.village || data.address.state_district || "Unknown";
              }
            } catch (e) {}
            setUserCity(cityExtracted);
          },
          (err) => { alert("Location permission denied. You cannot submit a report without location data."); }
        );
      } else { alert("Geolocation is not supported by your browser."); }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth; canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      canvasRef.current.toBlob((blob) => {
        const file = new File([blob], "live_capture.jpg", { type: "image/jpeg" });
        setMediaFile(file); setMediaType('image'); setPreview(URL.createObjectURL(file)); stopCamera(); 
      }, 'image/jpeg', 0.9); 
    }
  };
  const startRecording = () => {
    recordedChunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) recordedChunksRef.current.push(event.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const file = new File([blob], "live_record.webm", { type: 'video/webm' });
      setMediaFile(file); setMediaType('video'); setPreview(URL.createObjectURL(blob)); stopCamera();
    };
    mediaRecorder.start(); setIsRecording(true);
  };
  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) mediaRecorderRef.current.stop(); };
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) { resetReportState(); setMediaFile(file); setMediaType(file.type.startsWith('video/') ? 'video' : 'image'); setPreview(URL.createObjectURL(file)); }
  };

  // --- REPORTING ---
  const handleAnalyzeMedia = async (e) => {
    e.preventDefault();
    if (!mediaFile) return;
    setLoading(true); setError(null); setAiDraft(null);
    const formData = new FormData(); formData.append('media', mediaFile); 
    try {
      const response = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: formData });
      const data = await response.json();
      if (response.ok) setAiDraft(data.data); else setError(data.error);
    } catch (err) { setError('Cannot connect to server.'); } finally { setLoading(false); }
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    if(userProfile && userProfile.reports_today >= userProfile.reports_limit) return setError("Daily limit reached.");
    setLoading(true); setError(null);
    
    const combinedDescription = additionalNotes.trim() ? `${aiDraft.description}\n\nCitizen Notes: ${additionalNotes.trim()}` : aiDraft.description;
    const formData = new FormData(); 
    formData.append('media', mediaFile); 
    formData.append('contact_no', contactNo);
    formData.append('category', aiDraft.category);
    formData.append('severity', aiDraft.severity);
    formData.append('description', combinedDescription);
    formData.append('is_live', preview && preview.includes('blob') ? 'true' : 'false');
    if (address) formData.append('address', address);
    if (userCity) formData.append('city', userCity);
    if (userLat) formData.append('lat', userLat);
    if (userLng) formData.append('lng', userLng);

    try {
      const response = await fetch(`${API_BASE}/report`, { method: 'POST', body: formData });
      const data = await response.json();
      if (response.ok) { 
        setResult({ issue_id: data.issue_id, data: { ...aiDraft, description: combinedDescription }}); 
        setAiDraft(null); loadUserProfile(); 
      } else { setError(data.error); }
    } catch (err) { setError('Cannot connect to server.'); } finally { setLoading(false); }
  };

  const fetchTrackDetail = async (id) => {
    if (!id) return;
    setTrackLoading(true); setTrackError(null); setTrackResult(null); setRatingVal(0);
    try {
      const response = await fetch(`${API_BASE}/issues/${id}?contact_no=${contactNo}`);
      const data = await response.json();
      if (response.ok) { setTrackResult(data.issue); } else { setTrackError(data.error); }
    } catch (err) { setTrackError('Cannot connect to server.'); } finally { setTrackLoading(false); }
  }

  const handleRateIssue = async (e) => {
    e.preventDefault();
    if (!ratingVal || !trackResult) return;
    try {
        const response = await fetch(`${API_BASE}/issues/${trackResult.id}/rate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: ratingVal, contact_no: contactNo }) });
        if(response.ok) { alert("Thank you for your rating!"); setTrackResult({...trackResult, satisfaction_rating: ratingVal}); }
    } catch(err) {}
  };

  // --- ADMIN FUNCTIONS ---
  const handleAdminLoginSubmit = async (e, force = false) => {
    if (e) e.preventDefault(); 
    setAdminLoginError(null); setAdminLoading(true); setAdminLocating(true);
    
    let locationStr = 'Unknown Location';
    if (navigator.geolocation) {
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
            const locData = await res.json();
            locationStr = locData.display_name || `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`;
        } catch (err) {
            locationStr = 'Location Denied or Unavailable';
        }
    }
    setAdminLocating(false);

    try {
      const response = await fetch(`${API_BASE}/admin/login`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ username: adminUsername, password: adminPassword, location: locationStr, force_login: force }) 
      });
      const data = await response.json();
      
      if (response.status === 409 && data.requires_force) {
          setAdminRequiresForce(true);
          setAdminLoading(false);
          return;
      }

      if (response.ok) {
        sessionStorage.setItem('admin_token', data.token); 
        sessionStorage.setItem('admin_role', data.role);
        sessionStorage.setItem('admin_name', data.username);
        sessionStorage.setItem('admin_city', data.city); 
        setCurrentAdminRole(data.role); setCurrentAdminName(data.username); setCurrentAdminCity(data.city); setCurrentView('admin');
        setAdminTab('dashboard'); 
        await loadAdminDashboardData(); 
        setAdminUsername(''); setAdminPassword(''); setAdminRequiresForce(false);
      } else { setAdminLoginError(data.error); setAdminLoading(false); }
    } catch (err) { setAdminLoginError("Cannot connect to server."); setAdminLoading(false); } 
  };

  const handleAdminStatusUpdate = async (issueId, newStatus) => {
    const token = sessionStorage.getItem('admin_token');
    try {
      const response = await fetch(`${API_BASE}/admin/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ issue_id: issueId, status: newStatus }) });
      if (response.ok) { loadAdminDashboardData(); } else { alert("Update failed or Unauthorized."); }
    } catch (err) {}
  };

  const handleAdminLogout = async () => {
    if(window.confirm("Are you sure you want to log out?")) {
        const token = sessionStorage.getItem('admin_token');
        try { await fetch(`${API_BASE}/admin/logout`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }}); } catch(e){}
        setCurrentView('home'); sessionStorage.clear(); setCurrentAdminName(''); setCurrentAdminCity(''); setAdminProfileSection(null);
    }
  };

  const fetchSystemAdmins = async () => {
    const token = sessionStorage.getItem('admin_token'); 
    try {
      const response = await fetch(`${API_BASE}/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await response.json();
      if (response.ok) setSystemAdmins(data.admins);
    } catch (err) {}
  };

  const handleAdminFormSubmit = async (e) => {
    e.preventDefault();
    setIsSavingAdmin(true);
    const token = sessionStorage.getItem('admin_token'); 
    const url = isEditingAdmin ? `${API_BASE}/admin/users/${adminForm.id}` : `${API_BASE}/admin/users`;
    try {
      const response = await fetch(url, { method: isEditingAdmin ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(adminForm) });
      if (response.ok) {
        setAdminMessage(isEditingAdmin ? "Admin updated." : "Admin created.");
        setTimeout(() => setAdminMessage(null), 3000);
        setAdminForm({ id: null, username: '', password: '', assigned_city: '', role: 'local_admin' });
        setIsEditingAdmin(false); fetchSystemAdmins();
      } else { const errorData = await response.json(); alert(errorData.error); }
    } catch (err) { alert("Failed to save admin."); }
    finally { setIsSavingAdmin(false); }
  };

  const handleDeleteAdmin = async (id) => {
    if (!window.confirm("Are you sure you want to delete this admin?")) return;
    const token = sessionStorage.getItem('admin_token');
    try {
      const response = await fetch(`${API_BASE}/admin/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) fetchSystemAdmins(); else alert("Failed to delete.");
    } catch (err) {}
  };

  const getStatusCount = (statusName) => {
    if (!publicAnalytics || !publicAnalytics.status_data) return 0;
    const stat = publicAnalytics.status_data.find(s => s.name === statusName);
    return stat ? stat.value : 0;
  };

  // --- REUSABLE DASHBOARD COMPONENT ---
  const renderDashboard = (isCitizen = true) => {
    if (publicAnalyticsError) return (
        <div className="w-full bg-red-950/50 border border-red-500 rounded-2xl p-6 text-center mt-6">
           <h3 className="text-red-400 font-bold mb-2">Failed to load Dashboard</h3>
        </div>
    );
    if (!publicAnalytics) return <div className="text-center py-10 text-slate-400 font-bold animate-pulse">Loading data...</div>;

    const pieChartData = publicAnalytics.status_data.filter(s => ['Under Review', 'In Progress', 'Resolved'].includes(s.name));

    return (
      <div className={`w-full ${isCitizen ? 'pb-8 space-y-6' : 'bg-slate-900 rounded-2xl shadow-xl md:p-6 p-4 border border-slate-800'} animate-fade-in`}>
        {isCitizen && <h2 className="text-xl font-bold text-emerald-400 mb-6 border-b border-slate-700 pb-3">{userCity !== 'Unknown' ? `${userCity} Local Dashboard` : 'Local Dashboard'}</h2>}
        {!isCitizen && <h2 className="text-xl font-bold text-purple-400 mb-6 border-b border-slate-700 pb-3">{currentAdminRole === 'super_admin' ? 'Global Overview' : `${currentAdminCity} Overview`}</h2>}
        
        {/* ADMIN DASHBOARD MONTHLY REPORT */}
        {!isCitizen && adminPerformance && (
           <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md mb-8">
              <h3 className="text-sm font-bold text-slate-300 mb-4 tracking-wider uppercase border-b border-slate-700 pb-2">Monthly Performance Report</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl text-center shadow-inner">
                    <div className="text-slate-400 text-[10px] md:text-xs font-bold uppercase mb-1">Avg Resolution Time</div>
                    <div className="text-xl md:text-2xl font-mono font-bold text-blue-400">{adminPerformance.average_resolution_time}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl text-center shadow-inner">
                    <div className="text-slate-400 text-[10px] md:text-xs font-bold uppercase mb-1">Citizen Satisfaction</div>
                    <div className="text-xl md:text-2xl font-mono font-bold text-emerald-400">{adminPerformance.citizen_satisfaction} <span className="text-xs text-slate-500">/ 5</span></div>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl text-center shadow-inner">
                    <div className="text-slate-400 text-[10px] md:text-xs font-bold uppercase mb-1">Assigned This Month</div>
                    <div className="text-xl md:text-2xl font-mono font-bold text-purple-400">{adminPerformance.monthly_assigned}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl text-center shadow-inner">
                    <div className="text-slate-400 text-[10px] md:text-xs font-bold uppercase mb-1">Solved This Month</div>
                    <div className="text-xl md:text-2xl font-mono font-bold text-emerald-400">{adminPerformance.monthly_solved}</div>
                  </div>
              </div>
           </div>
        )}

        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
          <div className={`${isCitizen ? 'bg-slate-900 border-slate-700' : 'bg-slate-950 border-slate-800'} border p-3 md:p-5 rounded-xl text-center`}>
            <div className="text-slate-400 text-[10px] md:text-xs font-bold uppercase mb-1 truncate">Active</div>
            <div className="text-2xl md:text-4xl font-extrabold text-red-400">{getStatusCount('Under Review')}</div>
          </div>
          <div className={`${isCitizen ? 'bg-slate-900 border-slate-700' : 'bg-slate-950 border-slate-800'} border p-3 md:p-5 rounded-xl text-center`}>
            <div className="text-slate-400 text-[10px] md:text-xs font-bold uppercase mb-1 truncate">In Progress</div>
            <div className="text-2xl md:text-4xl font-extrabold text-yellow-400">{getStatusCount('In Progress')}</div>
          </div>
          <div className={`${isCitizen ? 'bg-slate-900 border-slate-700' : 'bg-slate-950 border-slate-800'} border p-3 md:p-5 rounded-xl text-center`}>
            <div className="text-slate-400 text-[10px] md:text-xs font-bold uppercase mb-1 truncate">Solved</div>
            <div className="text-2xl md:text-4xl font-extrabold text-emerald-400">{getStatusCount('Resolved')}</div>
          </div>
        </div>

        <div className="mb-6">
           <div className="text-slate-400 font-bold text-sm mb-3 flex items-center justify-between">
              <span>Live Status Map</span>
              <div className="flex gap-2 md:gap-3 text-[10px] md:text-xs">
                 <span className="flex items-center gap-1"><span className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-red-500"></span> Active</span>
                 <span className="flex items-center gap-1"><span className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-yellow-500"></span> In Progress</span>
                 <span className="flex items-center gap-1"><span className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-emerald-500"></span> Solved</span>
              </div>
           </div>
           <div className={`w-full ${isCitizen ? 'h-[300px]' : 'h-[400px]'} rounded-xl overflow-hidden border border-slate-700 relative z-0`}>
             <MapContainer center={[22.9074, 79.3810]} zoom={4} style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}>
               <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
               {publicAnalytics.map_data.map((point, index) => (
                 <Marker key={index} position={[point.lat, point.lng]} icon={getMarkerIcon(point.status)}>
                   <Popup className="custom-popup"><div className="font-bold text-slate-800">{point.category}</div><div className="text-xs text-slate-600">{point.status}</div></Popup>
                 </Marker>
               ))}
             </MapContainer>
           </div>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${isCitizen ? 'h-[500px] md:h-64' : 'h-64'}`}>
          <div className={`${isCitizen ? 'bg-slate-900 border-slate-700' : 'bg-slate-950 border-slate-800'} border p-4 rounded-xl flex flex-col h-64 md:h-full`}>
            <div className="text-slate-400 font-bold text-sm mb-4">Issues by Category</div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={publicAnalytics.category_data} margin={{ top: 20 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff'}} />
                <Bar dataKey="count" fill={isCitizen ? "#34d399" : "#a855f7"} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" fill="#94a3b8" fontSize={12} fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className={`${isCitizen ? 'bg-slate-900 border-slate-700' : 'bg-slate-950 border-slate-800'} border p-4 rounded-xl flex flex-col h-64 md:h-full relative`}>
            <div className="text-slate-400 font-bold text-sm mb-4">Resolution Progress</div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                  {pieChartData.map((entry, index) => {
                      const color = entry.name === 'Under Review' ? '#f43f5e' : entry.name === 'In Progress' ? '#eab308' : '#10b981';
                      return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Pie>
                <Tooltip contentStyle={{backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff'}} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute bottom-4 right-4 flex flex-col items-end text-xs font-mono">
                <span className="text-red-400 font-bold">Act: {getStatusCount('Under Review')}</span>
                <span className="text-yellow-400 font-bold">Prg: {getStatusCount('In Progress')}</span>
                <span className="text-emerald-400 font-bold">Sol: {getStatusCount('Resolved')}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };


  // --- RENDERERS ---
  const renderHome = () => (
    <div className="w-full max-w-4xl mx-auto flex flex-col animate-fade-in mt-20 px-4">
      <div className="flex flex-col items-center space-y-8 mb-12">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-extrabold text-emerald-400 tracking-tight">Community Hero</h1>
          <p className="text-slate-300 text-lg">Fix your neighborhood. Empower your city.</p>
        </div>
        <div className="w-full max-w-lg flex flex-col gap-4">
          <button onClick={() => { 
            if (contactNo && contactNo.length === 10) { setCurrentView('citizen'); setCitizenTab('impact'); loadCitizenFeed(); } 
            else { setCurrentView('citizen_login'); }
          }} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold text-slate-900 text-lg transition-transform active:scale-95 shadow-lg shadow-emerald-500/20">Use as Citizen</button>
          <button onClick={() => { setCurrentView('admin_login'); }} className="w-full py-4 bg-purple-900/50 hover:bg-purple-800/80 border border-purple-500 rounded-xl font-bold text-purple-200 text-lg transition-transform active:scale-95">City Admin Login</button>
        </div>
      </div>
    </div>
  );

  const renderCitizenLogin = () => (
    <div className="w-full max-w-md bg-slate-800 rounded-2xl shadow-xl p-6 border border-slate-700 animate-fade-in mt-10">
      <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
        <h2 className="text-2xl font-bold text-emerald-400">Citizen Portal</h2>
        <button onClick={() => setCurrentView('home')} className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1 bg-slate-900 rounded-full">← Back</button>
      </div>

      <div className="flex bg-slate-900 p-1 rounded-xl mb-6 shadow-inner">
          <button onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${authMode === 'login' ? 'bg-emerald-500 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>{t('loginBtn')}</button>
          <button onClick={() => setAuthMode('register')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${authMode === 'register' ? 'bg-emerald-500 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>{t('regBtn')}</button>
      </div>
      
      <form onSubmit={handleCitizenAuth} className="space-y-4 animate-fade-in">
        <div>
          <label className="block text-sm font-bold text-slate-400 mb-2">{t('phone')}</label>
          <input type="tel" value={contactNo} onChange={(e) => setContactNo(e.target.value.replace(/\D/g, ''))} placeholder="10 Digits" maxLength="10" pattern="\d{10}" className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-4 focus:outline-none focus:border-emerald-500" required />
        </div>
        
        {authMode === 'register' && (
            <>
                <div>
                  <label className="block text-sm font-bold text-slate-400 mb-2">{t('username')}</label>
                  <input type="text" value={regForm.username} onChange={(e) => setRegForm({...regForm, username: e.target.value})} placeholder="Pick a username" className={`w-full bg-slate-900 border ${usernameAvailable === false ? 'border-red-500' : usernameAvailable === true ? 'border-emerald-500' : 'border-slate-700'} text-white rounded-xl p-4 focus:outline-none focus:border-emerald-500`} required />
                  {usernameAvailable === true && <span className="text-xs font-bold text-emerald-400 mt-1 block">Username is available!</span>}
                  {usernameAvailable === false && <span className="text-xs font-bold text-red-400 mt-1 block">Username is already taken.</span>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-400 mb-2">{t('fullname')}</label>
                  <input type="text" value={regForm.name} onChange={(e) => setRegForm({...regForm, name: e.target.value})} placeholder="Your Name" className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-4 focus:outline-none focus:border-emerald-500" required={authMode === 'register'} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-400 mb-2">{t('address')}</label>
                  <input type="text" value={regForm.address} onChange={(e) => setRegForm({...regForm, address: e.target.value})} placeholder="Local Area" className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-4 focus:outline-none focus:border-emerald-500" required={authMode === 'register'} />
                </div>
            </>
        )}

        <div>
          <label className="block text-sm font-bold text-slate-400 mb-2">{t('pass')}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-4 focus:outline-none focus:border-emerald-500" required />
        </div>

        {authMode === 'register' && (
             <div>
               <label className="block text-sm font-bold text-slate-400 mb-2">{t('confirmPass')}</label>
               <input type="password" value={regForm.confirmPassword} onChange={(e) => setRegForm({...regForm, confirmPassword: e.target.value})} placeholder="Re-enter Password" className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-4 focus:outline-none focus:border-emerald-500" required />
             </div>
        )}

        <button type="submit" disabled={isAuthLoading || usernameAvailable === false} className={`w-full py-4 mt-2 rounded-xl font-bold text-lg transition-transform shadow-lg ${isAuthLoading || usernameAvailable === false ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600 text-slate-900 shadow-emerald-500/20 active:scale-95'}`}>
            {isAuthLoading ? 'Verifying...' : (authMode === 'login' ? t('loginBtn') : t('regBtn'))}
        </button>
      </form>
    </div>
  );

  const renderAdminLogin = () => (
    <div className="w-full max-w-md bg-slate-800 rounded-2xl shadow-xl p-6 border border-slate-700 animate-fade-in mt-10">
      <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
        <h2 className="text-2xl font-bold text-purple-400">Admin Login</h2>
        <button onClick={() => { setCurrentView('home'); setAdminRequiresForce(false); }} className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1 bg-slate-900 rounded-full">← Back</button>
      </div>
      
      {!adminRequiresForce ? (
          <form onSubmit={(e) => handleAdminLoginSubmit(e, false)} className="space-y-4">
            <div><label className="block text-sm font-bold text-slate-400 mb-2">Username</label><input type="text" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-4 focus:outline-none focus:border-purple-500" required /></div>
            <div><label className="block text-sm font-bold text-slate-400 mb-2">Password</label><input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-4 focus:outline-none focus:border-purple-500" required /></div>
            {adminLoginError && <div className="p-3 bg-red-950/50 border border-red-500/50 text-red-400 rounded-lg text-sm text-center font-bold">{adminLoginError}</div>}
            <button type="submit" disabled={adminLoading} className={`w-full py-4 rounded-xl font-bold text-slate-900 text-lg transition-transform active:scale-95 ${adminLoading ? 'bg-slate-700 text-slate-500' : 'bg-purple-500 hover:bg-purple-600'}`}>
                {adminLocating ? 'Acquiring Location...' : adminLoading ? 'Verifying...' : 'Access Dashboard'}
            </button>
          </form>
      ) : (
          <div className="space-y-4 animate-fade-in">
              <div className="p-4 bg-yellow-950/50 border border-yellow-500/50 text-yellow-200 rounded-xl text-sm shadow-inner text-center">
                  <div className="text-2xl mb-2">⚠️</div>
                  <h3 className="font-bold mb-1">Active Session Detected</h3>
                  <p className="text-xs text-yellow-400/80">You are currently logged in on another device. Logging in here will end your previous session.</p>
              </div>
              <div className="flex flex-col gap-3">
                  <button onClick={() => handleAdminLoginSubmit(null, true)} disabled={adminLoading} className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95">
                      {adminLocating ? 'Acquiring Location...' : adminLoading ? 'Processing...' : 'End Previous Session & Login'}
                  </button>
                  <button onClick={() => { setAdminRequiresForce(false); setAdminLoading(false); }} className="w-full py-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold rounded-xl transition-colors">
                      Cancel
                  </button>
              </div>
          </div>
      )}
    </div>
  );

  const filteredFeed = (feedIssues || []).filter(issue => 
    issue.category.toLowerCase().includes(searchQuery.toLowerCase()) || 
    issue.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (issue.address && issue.address.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const renderCitizenPortal = () => {
    const hasLocation = userLat && userLng;

    return (
    <div className="w-full max-w-md md:max-w-lg mx-auto bg-slate-950 h-[100dvh] flex flex-col relative overflow-hidden shadow-2xl sm:border-x sm:border-slate-800 animate-fade-in">
      
      {showTutorial && (
          <div className="absolute inset-0 bg-slate-950/90 z-[100] flex flex-col items-center justify-center p-6 backdrop-blur-md">
              <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl p-6 shadow-2xl text-center max-w-sm">
                  <div className="text-4xl mb-4">🚀</div>
                  <h3 className="text-xl font-bold text-emerald-400 mb-2">Welcome to Command Center</h3>
                  <p className="text-sm text-slate-300 mb-6 leading-relaxed">
                      1. Use the <strong>+</strong> button to capture and report issues.<br/>
                      2. <strong>Track</strong> your reports to see when they are fixed.<br/>
                      3. Earn XP and badges in your <strong>Profile</strong> by participating!
                  </p>
                  <button onClick={() => { localStorage.setItem('tutorialDone', 'true'); setShowTutorial(false); }} className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold">Get Started</button>
              </div>
          </div>
      )}

      {/* HEADER */}
      <div className="flex justify-between items-center px-4 py-3 bg-slate-900 border-b border-slate-800 z-10">
        <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">Command Center</h2>
        <div className="flex items-center gap-3">
            <div className="relative" ref={notifPanelRef}>
                <button onClick={() => setShowNotifs(!showNotifs)} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 relative text-slate-300">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    {userProfile?.unread_notifications > 0 && <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 border border-slate-800 text-[10px] font-bold text-white px-1">{userProfile.unread_notifications}</span>}
                </button>
                {showNotifs && (
                    <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-3 flex flex-col gap-2">
                        <div className="text-xs font-bold text-slate-500 pb-2 border-b border-slate-800 flex justify-between">
                            <span>LATEST NOTIFICATIONS</span>
                        </div>
                        {notifications.length === 0 ? <div className="text-xs text-slate-500 py-4 text-center">All clear. No comms.</div> : (
                            <div className="flex flex-col gap-2">
                                {notifications.slice(0, 3).map(n => (
                                    <div key={n.id} className={`p-3 rounded-lg border ${!n.is_read ? 'bg-slate-800 border-emerald-500/50' : 'bg-slate-900 border-slate-700'}`}>
                                        <div className={`text-xs font-bold mb-1 ${!n.is_read ? 'text-emerald-400' : 'text-slate-300'}`}>{n.title}</div>
                                        <div className="text-xs text-slate-400 leading-tight">{n.message}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button onClick={() => { setCitizenTab('notifications'); setShowNotifs(false); }} className="w-full mt-2 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300 transition-colors">
                            View All Notifications
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 custom-scrollbar relative">
          
          {citizenTab === 'impact' && renderDashboard(true)}

          {citizenTab === 'notifications' && (
            <div className="space-y-4 animate-fade-in">
               <h3 className="font-bold text-lg text-emerald-400">All Notifications</h3>
               {notifications.length === 0 ? (
                   <div className="text-center py-10 text-slate-500">No communication logs found.</div>
               ) : (
                   <div className="flex flex-col gap-3">
                       {notifications.map(n => (
                           <div key={n.id} className={`p-4 rounded-xl border transition-colors ${!n.is_read ? 'bg-slate-800 border-emerald-500/50 shadow-[0_0_10px_rgba(52,211,153,0.1)]' : 'bg-slate-900 border-slate-700'}`}>
                               <div className="flex justify-between items-start mb-1">
                                   <div className={`text-sm font-bold ${!n.is_read ? 'text-emerald-400' : 'text-slate-300'}`}>{n.title}</div>
                                   {!n.is_read && <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shadow-[0_0_5px_#10b981]"></span>}
                               </div>
                               <div className="text-sm text-slate-400 leading-relaxed">{n.message}</div>
                               <div className="text-[10px] text-slate-500 mt-3 font-mono">{new Date(n.created_at).toLocaleString()}</div>
                           </div>
                       ))}
                   </div>
               )}
            </div>
          )}

          {citizenTab === 'feed' && (
            <div className="space-y-4 animate-fade-in">
              <input type="text" placeholder="Search local feed by keyword..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500 shadow-sm" />
              
              {locationError && <div className="p-2 bg-yellow-900/30 border border-yellow-500/50 text-yellow-400 rounded-lg text-xs">{locationError}</div>}
              
              {feedLoading ? <div className="text-center py-10 text-slate-400 font-bold animate-pulse">Scanning grid...</div> : filteredFeed.length === 0 ? <div className="text-center py-10 text-slate-500">Grid is secure! No active issues.</div> : (
                <div className="flex flex-col gap-4">
                  {filteredFeed.map(issue => {
                    const isMyReport = issue.reporter_id === contactNo;
                    const isVerifying = verifyingIds.includes(issue.id);
                    return (
                      <div key={issue.id} className="bg-slate-900 rounded-xl p-4 border border-slate-700 flex flex-col gap-3 shadow-md">
                        {issue.media_url && (
                          <div className="w-full h-40 bg-black rounded-lg overflow-hidden relative">
                            {issue.media_url.includes('video/webm') || issue.media_url.includes('video/mp4') ? <video src={issue.media_url} controls className="w-full h-full object-cover" /> : <img src={issue.media_url} alt="Report" className="w-full h-full object-cover" />}
                          </div>
                        )}
                        <div className="flex justify-between items-start">
                          <div>
                              <span className="text-xs text-emerald-400 font-mono">#{issue.id}</span>
                              <h3 className="font-bold text-slate-200 leading-tight">{issue.category}</h3>
                          </div>
                          <span className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[10px] font-bold text-slate-400 uppercase transition-colors">{issue.status}</span>
                        </div>
                        <p className="text-sm text-slate-400 leading-tight whitespace-pre-line">{issue.description}</p>
                        <div className="flex justify-between items-center mt-2 pt-3 border-t border-slate-800">
                          <span className="text-xs text-slate-500 font-bold">Public Report</span>
                          <button 
                            onClick={() => !isMyReport && handleVerifyIssue(issue.id)} 
                            disabled={isMyReport || isVerifying}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex gap-1 items-center ${isMyReport ? 'bg-slate-700 text-slate-400 border border-slate-600 cursor-not-allowed' : issue.has_voted ? 'bg-emerald-500 text-slate-900 border border-emerald-500 active:scale-95' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 active:scale-95'} ${(isVerifying && !isMyReport) ? 'opacity-50 cursor-wait' : ''}`}
                          >
                            {isMyReport ? `✓ ${t('verified')} (${issue.upvotes})` : `<span>${issue.has_voted ? '✓' : '▲'}</span> ${issue.has_voted ? t('verified') : t('verify')} (${issue.upvotes})`}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {citizenTab === 'track' && (
            <div className="space-y-6 animate-fade-in">
              <form onSubmit={(e) => { e.preventDefault(); fetchTrackDetail(trackId); }} className="flex gap-2">
                  <input type="number" value={trackId} onChange={(e) => setTrackId(e.target.value)} placeholder="Global Search by Issue ID..." className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 focus:border-emerald-500 font-bold shadow-sm" required />
                  <button type="submit" disabled={!trackId || trackLoading} className={`px-5 py-3 rounded-xl font-bold ${!trackId || trackLoading ? 'bg-slate-700 text-slate-500' : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/20 shadow-lg active:scale-95'}`}>{trackLoading ? '...' : 'Search'}</button>
              </form>

              {trackError && <div className="p-4 bg-red-950/50 border border-red-500 text-red-200 rounded-xl text-sm shadow-sm">⚠️ {trackError}</div>}

              {!trackResult ? (
                  <div className="space-y-4">
                     <h3 className="text-lg font-bold text-emerald-400 border-b border-slate-700 pb-2">My Reported Issues Overview</h3>
                     {myIssues.length === 0 ? <p className="text-slate-500">You haven't submitted any reports yet.</p> : myIssues.map(issue => (
                         <div key={issue.id} onClick={() => fetchTrackDetail(issue.id)} className="bg-slate-900 border border-slate-700 p-4 rounded-xl cursor-pointer hover:border-emerald-500 transition-colors shadow-sm flex justify-between items-center">
                             <div>
                                 <div className="font-bold text-slate-200">#{issue.id} - {issue.category}</div>
                                 <div className="text-xs text-slate-500 mt-1">{issue.date}</div>
                             </div>
                             <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${issue.status === 'Resolved' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-500/30' : 'bg-yellow-900/50 text-yellow-400 border border-yellow-500/30'}`}>{issue.status}</span>
                         </div>
                     ))}
                  </div>
              ) : (
                  <div className="space-y-4">
                     <button onClick={() => { setTrackResult(null); setTrackId(''); }} className="text-sm font-bold text-slate-400 hover:text-white px-3 py-1 bg-slate-900 border border-slate-700 rounded-full mb-2">← Clear Search / Back</button>
                     <div className="p-5 bg-slate-900 rounded-xl border border-slate-700 space-y-4 shadow-sm animate-fade-in">
                       {trackResult.media_url && (
                         <div className="w-full h-32 bg-black rounded-lg overflow-hidden border border-slate-700 mb-4">
                           {trackResult.media_url.includes('video/webm') || trackResult.media_url.includes('video/mp4') ? <video src={trackResult.media_url} controls className="w-full h-full object-cover" /> : <img src={trackResult.media_url} alt="Report preview" className="w-full h-full object-cover" />}
                         </div>
                       )}
                       <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                         <h3 className="font-bold text-slate-200">Issue #{trackResult.id}</h3>
                         <span className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded-full text-xs font-bold uppercase transition-colors">{trackResult.status}</span>
                       </div>
                       <p className="text-sm text-slate-300 bg-slate-800 p-3 rounded-lg whitespace-pre-line border border-slate-700">{trackResult.description}</p>
                       
                       {trackResult.status === 'Resolved' && trackResult.reporter_id === contactNo && (
                           <div className="pt-4 border-t border-slate-700">
                               {trackResult.satisfaction_rating ? (
                                   <div className="text-xs font-bold text-emerald-400 text-center">Thanks for rating! ({trackResult.satisfaction_rating}/5)</div>
                               ) : (
                                   <form onSubmit={handleRateIssue} className="flex flex-col items-center gap-3">
                                       <div className="text-xs text-slate-400 font-bold">Rate the solution:</div>
                                       <div className="flex gap-2">
                                           {[1,2,3,4,5].map(star => (
                                               <button key={star} type="button" onClick={() => setRatingVal(star)} className={`text-2xl ${ratingVal >= star ? 'text-yellow-400' : 'text-slate-700 hover:text-slate-500'}`}>★</button>
                                           ))}
                                       </div>
                                       {ratingVal > 0 && <button type="submit" className="px-4 py-2 bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs w-full">Submit Rating</button>}
                                   </form>
                               )}
                           </div>
                       )}
                     </div>
                  </div>
              )}
            </div>
          )}

          {citizenTab === 'report' && (
            <div className="space-y-6 animate-fade-in">
              {userProfile && userProfile.reports_today >= userProfile.reports_limit && (
                  <div className="p-4 bg-red-950/50 border border-red-500 text-red-200 rounded-xl text-sm font-bold text-center">⚠️ Daily Limit Reached (5/5). Rest to prevent grid spam.</div>
              )}

              {!hasLocation ? (
                 <div className="flex flex-col items-center justify-center py-10 space-y-4 border border-slate-700 rounded-xl bg-slate-900 shadow-lg mt-4">
                     <div className="text-4xl">📍</div>
                     <h3 className="text-lg font-bold text-slate-200">Location Required</h3>
                     <p className="text-sm text-slate-400 text-center px-6">You must grant location access to submit a complaint. This ensures accurate routing to city officials.</p>
                     <button onClick={requestLocationForReport} className="py-3 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-xl shadow-lg active:scale-95 transition-all">Grant Location Access</button>
                 </div>
              ) : (
                  <>
                      <div className={`flex flex-col gap-4 mb-6 ${(!isCameraActive && !preview && (!userProfile || userProfile.reports_today < userProfile.reports_limit)) ? 'flex' : 'hidden'}`}>
                        <button onClick={startCamera} className="w-full py-6 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 shadow-sm rounded-xl text-base font-bold transition-colors flex items-center justify-center gap-3 text-slate-300 hover:text-white">
                            <span className="text-2xl">📷</span> Live Camera Capture
                        </button>
                        <label className="w-full py-6 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 shadow-sm rounded-xl text-base font-bold transition-colors flex items-center justify-center gap-3 cursor-pointer text-slate-300 hover:text-white">
                            <span className="text-2xl">📁</span> Upload File from Device
                            <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
                        </label>
                      </div>

                      <div className={`flex-col items-center w-full mb-6 relative ${isCameraActive ? 'flex' : 'hidden'}`}>
                        <div className={`w-full h-80 bg-black rounded-xl overflow-hidden border-4 relative shadow-2xl ${isRecording ? 'border-red-500' : 'border-emerald-500'}`}>
                          {isRecording && (<div className="absolute top-3 right-3 flex items-center gap-2 bg-black/70 px-2 py-1 rounded-md z-10"><div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div><span className="text-xs font-bold text-white">REC</span></div>)}
                          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        </div>
                        <div className="flex w-full gap-3 mt-4">
                          {!isRecording ? (
                            <>
                              <button onClick={stopCamera} className="flex-1 py-3 bg-slate-800 border border-slate-700 rounded-xl font-bold text-slate-300 hover:text-white">Cancel</button>
                              <button onClick={capturePhoto} className="flex-[2] py-3 bg-emerald-500 text-slate-950 rounded-xl font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform">Take Photo</button>
                            </>
                          ) : (
                            <button onClick={stopRecording} className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/20">Stop Recording</button>
                          )}
                        </div>
                        {!isRecording && (
                             <button onClick={startRecording} className="w-full py-3 mt-3 bg-slate-800 hover:bg-slate-700 text-red-400 border border-slate-700 rounded-xl font-bold transition-colors">Start Video Record</button>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                      </div>

                      <div className={`${!isCameraActive && (preview || mediaFile) ? 'block' : 'hidden'}`}>
                        {!aiDraft && !result && (
                          <form onSubmit={handleAnalyzeMedia} className="space-y-6">
                            {preview && (
                              <div className="flex flex-col items-center w-full relative group bg-black rounded-xl border-2 border-slate-700 overflow-hidden shadow-lg">
                                {mediaType === 'video' ? <video src={preview} controls className="w-full max-h-80 object-cover" /> : <img src={preview} alt="Preview" className="w-full max-h-80 object-cover" />}
                                <button type="button" onClick={resetReportState} className="absolute top-2 right-2 bg-slate-900/80 px-3 py-1 rounded-full text-slate-300 font-bold hover:text-white z-10 border border-slate-700 backdrop-blur-sm">X</button>
                              </div>
                            )}
                            <button type="submit" disabled={!mediaFile || loading} className={`w-full py-4 rounded-xl font-bold transition-transform text-lg shadow-lg ${(!mediaFile || loading) ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-95 shadow-emerald-500/20'}`}>
                              {loading ? 'AI is scanning imagery...' : 'Analyze Issue'}
                            </button>
                          </form>
                        )}

                        {aiDraft && !result && (
                          <form onSubmit={handleFinalSubmit} className="bg-slate-900 p-5 rounded-xl border border-slate-700 mt-4 shadow-xl">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Issue Details</span>
                              <div className="flex gap-2">
                                <span className="px-2 py-1 rounded text-[10px] font-bold bg-slate-950 text-emerald-400 border border-slate-800 uppercase">{aiDraft.category}</span>
                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${aiDraft.severity === 'High' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'}`}>{aiDraft.severity}</span>
                              </div>
                            </div>
                            
                            <div className="mb-4">
                              <label className="block text-sm font-bold text-slate-300 mb-2">Description</label>
                              <div className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-lg p-3 text-sm cursor-not-allowed italic">
                                "{aiDraft.description}"
                              </div>
                            </div>
                            
                            <div className="mb-4">
                                <label className="block text-sm font-bold text-slate-300 mb-2">City (Auto-detected & Locked)</label>
                                <div className="w-full bg-slate-950 border border-slate-800 text-slate-500 rounded-lg p-3 text-sm cursor-not-allowed">
                                    {userCity}
                                </div>
                            </div>

                            <div className="mb-4">
                              <label className="block text-sm font-bold text-slate-300 mb-2">Location Address / Street</label>
                              <input type="text" value={address || ''} onChange={(e) => setAddress(e.target.value)} placeholder="Enter precise street location..." className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors shadow-inner" />
                            </div>

                            <div className="mb-5">
                              <label className="block text-sm font-bold text-slate-300 mb-2">Citizen Field Notes (Optional)</label>
                              <textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} rows="3" placeholder="Add specific details like cross-streets or business names..." className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors shadow-inner"></textarea>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-slate-800">
                              <button type="button" onClick={() => setAiDraft(null)} className="flex-1 py-3 rounded-lg font-bold bg-slate-800 text-slate-300 hover:text-white border border-slate-700">Back</button>
                              <button type="submit" disabled={loading} className="flex-[2] py-3 rounded-lg font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform">
                                {loading ? 'Uploading...' : 'Transmit Report'}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                  </>
              )}

              {error && <div className="p-4 bg-red-950/50 border border-red-500/50 text-red-200 rounded-xl text-sm font-bold text-center shadow-lg">⚠️ {error}</div>}
              {result && (
                <div className="p-6 bg-emerald-950/20 border border-emerald-500/50 rounded-xl space-y-4 shadow-xl">
                  <div className="flex items-center gap-3 mb-2 pb-3 border-b border-emerald-500/30">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 font-bold text-xl shadow-lg shadow-emerald-500/40">✓</div>
                    <h3 className="font-bold text-emerald-400 text-xl">Transmission Successful</h3>
                  </div>
                  <p className="text-sm text-slate-300 bg-slate-900 p-4 rounded-lg border border-slate-800 whitespace-pre-line shadow-inner">{result.data.description}</p>
                  
                  <div className="text-sm text-slate-400 py-3 italic border-b border-slate-800">
                    You can track the status of your complaint later using this Issue ID in the Track tab.
                  </div>

                  <div className="text-xs text-slate-400 pt-2 flex justify-between items-center">
                    <span>Issue ID: <strong className="text-white bg-slate-800 px-2 py-1 rounded">#{result.issue_id}</strong></span>
                    <button onClick={resetReportState} className="text-emerald-400 font-bold px-3 py-1.5 bg-emerald-500/10 rounded hover:bg-emerald-500/20 transition-colors">Report Another</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {citizenTab === 'profile' && userProfile && (
              <div className="space-y-6 animate-fade-in pb-4">
                  {isEditingProfile ? (
                      <form onSubmit={handleProfileUpdate} className="bg-slate-900 p-6 rounded-xl border border-slate-700 shadow-lg space-y-4">
                          <h3 className="text-xl font-bold text-emerald-400 mb-4">Edit Profile</h3>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">{t('lang')}</label>
                            <select value={editProfileForm.language} onChange={(e) => {
                                setEditProfileForm({...editProfileForm, language: e.target.value});
                                setUserLang(e.target.value); 
                            }} className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-3 text-sm focus:border-emerald-500 shadow-inner">
                              <option value="en">English</option><option value="hi">हिंदी</option><option value="mr">मराठी</option>
                            </select>
                          </div>
                          <div><label className="block text-xs font-bold text-slate-500 mb-1">{t('fullname')}</label><input type="text" value={editProfileForm.name} onChange={(e) => setEditProfileForm({...editProfileForm, name: e.target.value})} className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-3 text-sm focus:border-emerald-500 shadow-inner" required /></div>
                          <div><label className="block text-xs font-bold text-slate-500 mb-1">{t('address')}</label><input type="text" value={editProfileForm.address} onChange={(e) => setEditProfileForm({...editProfileForm, address: e.target.value})} className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-3 text-sm focus:border-emerald-500 shadow-inner" required /></div>
                          <div className="flex gap-3 pt-4 border-t border-slate-800">
                              <button type="button" onClick={() => { setIsEditingProfile(false); setEditProfileForm({name: userProfile.name, address: userProfile.address, language: userProfile.language}); setUserLang(userProfile.language); }} className="flex-1 py-3 bg-slate-800 border border-slate-700 rounded-lg font-bold text-slate-300 hover:text-white">Cancel</button>
                              <button type="submit" className="flex-[2] py-3 bg-emerald-500 hover:bg-emerald-400 rounded-lg font-bold text-slate-950 shadow-lg shadow-emerald-500/20">Save Changes</button>
                          </div>
                      </form>
                  ) : (
                      <div className="bg-slate-900 p-6 rounded-xl border border-emerald-500/50 shadow-xl text-center relative overflow-hidden flex flex-col items-center">
                          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-900 via-emerald-400 to-emerald-900"></div>
                          <button onClick={() => setIsEditingProfile(true)} className="absolute top-4 right-4 text-xs font-bold text-slate-400 hover:text-emerald-400 bg-slate-950 px-2 py-1 rounded border border-slate-800 transition-colors">✏️ Edit</button>
                          <h3 className="text-2xl font-extrabold text-white tracking-tight mt-2">{userProfile.name}</h3>
                          <p className="text-sm text-slate-400 mt-1 mb-5">@{userProfile.username || 'user'}</p>
                          
                          <div className="inline-block px-5 py-2 bg-emerald-950/50 border border-emerald-500/40 rounded-full shadow-inner mb-2 flex flex-col items-center">
                              <span className="text-sm font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                {RANK_ICONS[userProfile.rank]} Rank: {userProfile.rank}
                              </span>
                          </div>
                          <button onClick={() => setShowRanksGuide(true)} className="text-[10px] font-bold text-purple-400 hover:text-purple-300 transition-colors mb-6 uppercase tracking-widest bg-purple-900/20 border border-purple-500/20 px-2 py-1 rounded">📖 Explore Ranks</button>
                          
                          <div className="mb-2 bg-slate-950 p-4 rounded-xl border border-slate-800 w-full">
                              <div className="flex justify-between text-xs font-bold text-slate-400 mb-2 px-1">
                                  <span className="uppercase tracking-wider">Total XP</span>
                                  <span className="text-emerald-400 text-sm">{userProfile.xp} XP</span>
                              </div>
                              <div className="w-full bg-slate-900 rounded-full h-3 border border-slate-800 overflow-hidden">
                                  <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-3 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]" style={{ width: `${Math.min((userProfile.xp / 2500) * 100, 100)}%` }}></div>
                              </div>
                          </div>
                      </div>
                  )}

                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-700 shadow-sm">
                      <div className="flex justify-between items-center mb-5 border-b border-slate-800 pb-3">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Earned Badges</h4>
                          <button onClick={() => setShowBadgesGuide(true)} className="text-[10px] font-bold text-purple-400 hover:text-purple-300 bg-purple-900/20 px-2 py-1 rounded border border-purple-500/20 transition-colors uppercase tracking-widest">📖 Explore Badges</button>
                      </div>
                      {userProfile.badges.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center italic py-6 bg-slate-950 rounded-lg border border-slate-800">No badges earned yet. Secure the grid to unlock achievements.</p>
                      ) : (
                          <div className="grid grid-cols-2 gap-3">
                              {userProfile.badges.map(b => {
                                  const badgeDef = BADGES_INFO.find(info => info.name === b);
                                  return (
                                      <div key={b} className="bg-slate-950 border border-purple-500/30 p-4 rounded-xl flex flex-col items-center justify-center text-center gap-2 shadow-inner">
                                          <span className="text-3xl drop-shadow-md">{badgeDef?.icon || "🏅"}</span>
                                          <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">{b}</span>
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>

                  {/* Citizen App Bug Report Option */}
                  <button onClick={() => setShowProblemModal(true)} className="w-full py-3 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded-xl font-bold text-slate-300 text-sm transition-colors shadow-sm mt-2">
                      Report a Problem
                  </button>

                  <button onClick={handleCitizenLogout} className="w-full py-4 bg-slate-900 border border-red-500/30 hover:bg-red-900/20 rounded-xl font-bold text-red-400 text-sm transition-colors shadow-sm mt-4">
                      Log Out Command Center
                  </button>
              </div>
          )}
      </div>

      {/* --- PROBLEM MODAL --- */}
      {showProblemModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
                  <h3 className="text-xl font-bold text-emerald-400 mb-4">Report a Problem</h3>
                  <form onSubmit={submitProblem}>
                      <textarea value={problemForm} onChange={(e)=>setProblemForm(e.target.value)} required rows="4" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:border-emerald-500 mb-4" placeholder="Describe the problem or app bug..."></textarea>
                      <div className="flex gap-2">
                          <button type="button" onClick={() => setShowProblemModal(false)} className="flex-1 py-2 bg-slate-800 rounded-lg font-bold text-slate-300">Cancel</button>
                          <button type="submit" className="flex-[2] py-2 bg-emerald-500 text-slate-950 rounded-lg font-bold">Submit Report</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* --- SEPARATE EXPLORE MODALS --- */}
      {showRanksGuide && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => setShowRanksGuide(false)}>
              <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <h3 className="text-xl font-bold text-emerald-400 mb-4">Rank Hierarchy</h3>
                  <div className="space-y-3">
                      {RANKS_INFO.map(r => (
                          <div key={r.name} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
                              <span className="font-bold flex items-center gap-2">{r.icon} {r.name}</span>
                              <span className="text-emerald-400 text-xs font-mono">{r.xp} XP</span>
                          </div>
                      ))}
                  </div>
                  <button onClick={() => setShowRanksGuide(false)} className="w-full mt-4 py-2 bg-slate-800 rounded-lg font-bold text-slate-300">Close</button>
              </div>
          </div>
      )}

      {showBadgesGuide && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => setShowBadgesGuide(false)}>
              <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <h3 className="text-xl font-bold text-purple-400 mb-4">Achievement Badges</h3>
                  <div className="space-y-3 h-80 overflow-y-auto custom-scrollbar pr-2">
                      {BADGES_INFO.map(b => (
                          <div key={b.name} className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                              <div className="flex justify-between items-center mb-1">
                                  <span className="font-bold flex items-center gap-2 text-sm">{b.icon} {b.name}</span>
                                  <span className="text-purple-400 text-[10px] font-mono">{b.xp}</span>
                              </div>
                              <p className="text-[10px] text-slate-400">{b.desc}</p>
                          </div>
                      ))}
                  </div>
                  <button onClick={() => setShowBadgesGuide(false)} className="w-full mt-4 py-2 bg-slate-800 rounded-lg font-bold text-slate-300">Close</button>
              </div>
          </div>
      )}

      {/* --- BOTTOM NAVIGATION BAR (CITIZEN) --- */}
      <div className="absolute bottom-0 w-full bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex justify-between px-2 pb-safe pt-2 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
          <button onClick={() => setCitizenTab('impact')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${citizenTab === 'impact' ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
              <span className="text-xl mb-1">📊</span><span className="text-[10px] font-bold tracking-wide">{t('dashboard')}</span>
          </button>
          <button onClick={() => { setCitizenTab('feed'); loadCitizenFeed(); }} className={`flex flex-col items-center p-2 flex-1 transition-colors ${citizenTab === 'feed' ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
              <span className="text-xl mb-1">🗺️</span><span className="text-[10px] font-bold tracking-wide">{t('feed')}</span>
          </button>
          
          <div className="flex-[1.2]"></div> 
          
          <button onClick={() => setCitizenTab('track')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${citizenTab === 'track' ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
              <span className="text-xl mb-1">📍</span><span className="text-[10px] font-bold tracking-wide">{t('track')}</span>
          </button>
          <button onClick={() => setCitizenTab('profile')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${citizenTab === 'profile' ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
              <span className="text-xl mb-1">👤</span><span className="text-[10px] font-bold tracking-wide">{t('profile')}</span>
          </button>
      </div>

      {/* --- FLOATING ACTION BUTTON (FAB) --- */}
      <button 
          onClick={() => { setCitizenTab('report'); resetReportState(); stopCamera(); }}
          className={`absolute bottom-[28px] md:bottom-8 left-1/2 transform -translate-x-1/2 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl z-50 border-[6px] border-slate-950 transition-all active:scale-90 ${citizenTab === 'report' ? 'bg-emerald-400 text-slate-950 scale-105' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30'}`}
      >
          <svg className="w-8 h-8 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
      </button>

    </div>
    );
  };

  const renderAdminPortal = () => {
      const isSuperAdmin = currentAdminRole === 'super_admin';
      
      const filteredAdminIssues = adminIssues.filter(issue => 
          adminSearchId ? issue.id.toString().includes(adminSearchId) : true
      );
      
      return (
        <div className="w-full max-w-full md:max-w-4xl lg:max-w-6xl mx-auto bg-slate-950 h-[100dvh] flex flex-col relative overflow-hidden shadow-2xl animate-fade-in">
          
          {/* ADMIN HEADER */}
          <div className="flex justify-between items-center px-4 py-3 bg-slate-900 border-b border-slate-800 z-10">
            <h2 className="text-xl font-bold text-purple-400 flex items-center gap-2">{isSuperAdmin ? 'Super Admin' : 'City Admin'}</h2>
            <div className="flex items-center gap-3">
                <div className="relative" ref={notifPanelRef}>
                    <button onClick={() => setShowNotifs(!showNotifs)} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 relative text-slate-300">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        {notifications.filter(n => !n.is_read).length > 0 && <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 border border-slate-800 text-[10px] font-bold text-white px-1">{notifications.filter(n => !n.is_read).length}</span>}
                    </button>
                    {showNotifs && (
                        <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-3 flex flex-col gap-2">
                            <div className="text-xs font-bold text-slate-500 pb-2 border-b border-slate-800 flex justify-between">
                                <span>LATEST SYSTEM ALERTS</span>
                            </div>
                            {notifications.length === 0 ? <div className="text-xs text-slate-500 py-4 text-center">No alerts.</div> : (
                                <div className="flex flex-col gap-2">
                                    {notifications.slice(0, 3).map(n => (
                                        <div key={n.id} className={`p-3 rounded-lg border ${!n.is_read ? 'bg-slate-800 border-purple-500/50' : 'bg-slate-900 border-slate-700'}`}>
                                            <div className={`text-xs font-bold mb-1 ${!n.is_read ? 'text-purple-400' : 'text-slate-300'}`}>{n.title}</div>
                                            <div className="text-xs text-slate-400 leading-tight">{n.message}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button onClick={() => { setAdminTab('notifications'); setShowNotifs(false); }} className="w-full mt-2 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300 transition-colors">
                                View All Alerts
                            </button>
                        </div>
                    )}
                </div>
            </div>
          </div>

          {/* ADMIN SCROLLABLE BODY */}
          <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-6 pb-24 custom-scrollbar relative">
              
              {adminTab === 'dashboard' && renderDashboard(false)}

              {adminTab === 'real_time_report' && isSuperAdmin && (
                  <div className="space-y-6 animate-fade-in w-full max-w-4xl mx-auto">
                      <h2 className="text-2xl font-bold text-purple-400 border-b border-slate-700 pb-3">Real-Time Performance Reports</h2>
                      
                      {adminLoading && superAdminStats.length === 0 ? (
                          <div className="text-center py-10 text-slate-500 animate-pulse">Loading local admins...</div>
                      ) : selectedSuperAdminId ? (
                          <div className="bg-slate-900 p-6 rounded-xl border border-slate-700">
                              <button onClick={()=>setSelectedSuperAdminId(null)} className="text-sm text-slate-400 mb-4 hover:text-white">← Back to List</button>
                              {superAdminStats.filter(s => s.id === selectedSuperAdminId).map(stat => (
                                  <div key={stat.id}>
                                      <h3 className="text-xl font-bold text-slate-200 mb-2">{stat.username} <span className="text-xs font-mono text-purple-400 ml-2">({stat.city})</span></h3>
                                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                                          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">Active</div>
                                              <div className="text-2xl text-red-400 font-bold">{stat.active}</div>
                                          </div>
                                          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">In Progress</div>
                                              <div className="text-2xl text-yellow-400 font-bold">{stat.progress}</div>
                                          </div>
                                          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">Solved</div>
                                              <div className="text-2xl text-emerald-400 font-bold">{stat.solved}</div>
                                          </div>
                                          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">Monthly Assigned</div>
                                              <div className="text-xl text-slate-300 font-bold">{stat.monthly_assigned}</div>
                                          </div>
                                          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">Avg Resolution Time</div>
                                              <div className="text-xl text-blue-400 font-bold">{stat.avg_resolution_time}</div>
                                          </div>
                                          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">Avg Satisfaction</div>
                                              <div className="text-xl text-purple-400 font-bold">{stat.avg_csat} <span className="text-xs">/ 5</span></div>
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {superAdminStats.length === 0 ? <p className="text-slate-500 text-sm">No local admins deployed.</p> : superAdminStats.map(stat => (
                                  <div key={stat.id} onClick={() => setSelectedSuperAdminId(stat.id)} className="bg-slate-900 border border-slate-700 hover:border-purple-500 p-5 rounded-xl cursor-pointer transition-colors shadow-sm">
                                      <div className="font-bold text-slate-200">{stat.username}</div>
                                      <div className="text-xs text-slate-500 mb-3">{stat.city}</div>
                                      <div className="flex gap-3 text-xs font-mono">
                                          <span className="text-red-400">{stat.active} Act</span>
                                          <span className="text-emerald-400">{stat.solved} Sol</span>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              )}

              {adminTab === 'notifications' && (
                <div className="space-y-4 animate-fade-in w-full max-w-3xl mx-auto">
                   <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg text-purple-400">System Alerts</h3>
                   </div>
                   {notifications.length === 0 ? (
                       <div className="text-center py-10 text-slate-500">No alerts found.</div>
                   ) : (
                       <div className="flex flex-col gap-3">
                           {notifications.map(n => (
                               <div key={n.id} className={`p-4 rounded-xl border transition-colors ${!n.is_read ? 'bg-slate-800 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.1)]' : 'bg-slate-900 border-slate-700'}`}>
                                   <div className="flex justify-between items-start mb-1">
                                       <div className={`text-sm font-bold ${!n.is_read ? 'text-purple-400' : 'text-slate-300'}`}>{n.title}</div>
                                       {!n.is_read && <span className="w-2 h-2 rounded-full bg-purple-500 mt-1 shadow-[0_0_5px_#a855f7]"></span>}
                                   </div>
                                   <div className="text-sm text-slate-400 leading-relaxed">{n.message}</div>
                                   <div className="text-[10px] text-slate-500 mt-3 font-mono">{new Date(n.created_at).toLocaleString()}</div>
                               </div>
                           ))}
                       </div>
                   )}
                </div>
              )}

              {adminTab === 'issues' && !isSuperAdmin && (
                <div className="flex flex-col gap-2 w-full max-w-4xl mx-auto animate-fade-in">
                  {selectedAdminIssueId ? (
                     <AdminIssueDetail issueId={selectedAdminIssueId} adminIssues={adminIssues} onBack={() => setSelectedAdminIssueId(null)} onStatusUpdate={handleAdminStatusUpdate} />
                  ) : (
                     <div className="flex flex-col gap-3">
                        <div className="sticky top-0 bg-slate-950 z-10 pb-2">
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-slate-500">🔍</span>
                                <input type="text" placeholder="Search specific issue by ID..." value={adminSearchId} onChange={(e) => setAdminSearchId(e.target.value.replace(/\D/g, ''))} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-purple-500 font-bold shadow-sm" />
                            </div>
                        </div>

                        {adminLoading ? <div className="text-center py-10 text-slate-400 font-bold animate-pulse">Loading database records...</div> : 
                        filteredAdminIssues.length === 0 ? <div className="text-center py-10 text-slate-500">No issues found.</div> : (
                          filteredAdminIssues.map((issue) => <AdminIssueListCard key={issue.id} issue={issue} onSelect={setSelectedAdminIssueId} />)
                        )}
                     </div>
                  )}
                </div>
              )}

              {adminTab === 'users' && isSuperAdmin && (
                <div className="flex flex-col md:flex-row gap-6 animate-fade-in pb-4 w-full max-w-5xl mx-auto">
                  <div className="flex-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col shadow-lg h-[500px]">
                    <div className="bg-slate-950 p-4 font-bold text-purple-400 text-sm border-b border-slate-700 flex justify-between items-center">
                        <span>Active City Managers</span>
                        <span className="bg-purple-900/50 text-purple-200 px-2 py-0.5 rounded text-[10px]">{systemAdmins.length} Total</span>
                    </div>
                    <div className="overflow-y-auto p-3 custom-scrollbar flex-1">
                      {systemAdmins.map(admin => (
                        <div key={admin.id} className="flex justify-between items-center p-3 mb-2 bg-slate-800 rounded-lg border border-slate-700 shadow-inner">
                          <div>
                            <div className="font-bold text-slate-200 text-sm">{admin.username}</div>
                            <div className="text-[10px] font-mono text-slate-400 mt-1">{admin.assigned_city} • {admin.role.replace('_', ' ')}</div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setAdminForm({ id: admin.id, username: admin.username, password: '', assigned_city: admin.assigned_city, role: admin.role }); setIsEditingAdmin(true); }} className="px-2 py-1 bg-slate-900 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded border border-slate-600 transition-colors">Edit</button>
                            <button onClick={() => handleDeleteAdmin(admin.id)} className="px-2 py-1 bg-red-900/30 hover:bg-red-900/60 text-red-400 text-xs font-bold rounded border border-red-500/30 transition-colors">Del</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-5 flex flex-col shadow-lg h-[500px] overflow-y-auto">
                    <div className="font-bold text-slate-200 mb-4 pb-2 border-b border-slate-800">{isEditingAdmin ? 'Edit Administrator' : 'Add New Administrator'}</div>
                    <form onSubmit={handleAdminFormSubmit} className="space-y-4">
                      <div><label className="block text-xs font-bold text-slate-500 mb-1">Username</label><input type="text" value={adminForm.username} onChange={e => setAdminForm({...adminForm, username: e.target.value})} className="w-full bg-slate-950 border border-slate-700 text-white rounded p-3 text-sm focus:border-purple-500 shadow-inner" required /></div>
                      <div><label className="block text-xs font-bold text-slate-500 mb-1">{isEditingAdmin ? 'New Password (leave blank to keep current)' : 'Password'}</label><input type="password" value={adminForm.password} onChange={e => setAdminForm({...adminForm, password: e.target.value})} className="w-full bg-slate-950 border border-slate-700 text-white rounded p-3 text-sm focus:border-purple-500 shadow-inner" required={!isEditingAdmin} /></div>
                      <div><label className="block text-xs font-bold text-slate-500 mb-1">Assigned City</label><input type="text" value={adminForm.assigned_city} onChange={e => setAdminForm({...adminForm, assigned_city: e.target.value})} className="w-full bg-slate-950 border border-slate-700 text-white rounded p-3 text-sm focus:border-purple-500 shadow-inner" required /></div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Role Configuration</label>
                        <select value={adminForm.role} onChange={e => setAdminForm({...adminForm, role: e.target.value})} className="w-full bg-slate-950 border border-slate-700 text-white rounded p-3 text-sm focus:border-purple-500 shadow-inner"><option value="local_admin">Local Admin</option><option value="super_admin">Super Admin</option></select>
                      </div>
                      <div className="pt-2 flex gap-3">
                        {isEditingAdmin && <button type="button" onClick={() => { setIsEditingAdmin(false); setAdminForm({ id: null, username: '', password: '', assigned_city: '', role: 'local_admin' }); }} className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-3 rounded-lg transition-colors">Cancel</button>}
                        <button type="submit" disabled={isSavingAdmin} className={`${isEditingAdmin ? 'flex-[2]' : 'w-full'} bg-purple-500 hover:bg-purple-600 text-slate-900 font-bold py-3 rounded-lg transition-colors shadow-lg shadow-purple-500/20 disabled:opacity-50`}>{isSavingAdmin ? 'Processing...' : (isEditingAdmin ? 'Update Record' : 'Create Admin')}</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {adminTab === 'bugs' && (
                  <div className="space-y-6 animate-fade-in w-full max-w-4xl mx-auto">
                      <h2 className="text-2xl font-bold text-purple-400 border-b border-slate-700 pb-3">{isSuperAdmin ? 'Escalated Problems & Bugs' : 'Citizen Problem Reports'}</h2>
                      {appProblems.length === 0 ? <p className="text-slate-500 py-10 text-center">No platform or operational issues reported.</p> : (
                          <div className="space-y-3">
                              {appProblems.map(problem => (
                                  <div key={problem.id} className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                                      <div className="flex justify-between items-center mb-2">
                                          <div className="text-xs font-bold text-purple-400">Reporter: {problem.reporter_id} <span className="text-slate-500 font-normal">({problem.reporter_role})</span></div>
                                          <div className="text-[10px] text-slate-500">{new Date(problem.created_at).toLocaleString()}</div>
                                      </div>
                                      <p className="text-sm text-slate-300 bg-slate-950 p-3 rounded">{problem.description}</p>
                                      {!isSuperAdmin && problem.status !== 'Escalated' && (
                                          <button onClick={async () => {
                                              const token = sessionStorage.getItem('admin_token');
                                              await fetch(`${API_BASE}/bugs/${problem.id}/escalate`, {method: 'POST', headers: {'Authorization': `Bearer ${token}`}});
                                              loadProblems(true);
                                          }} className="mt-3 text-xs bg-red-900/40 hover:bg-red-900/80 text-red-300 px-3 py-1.5 rounded transition-colors">Escalate to Super Admin</button>
                                      )}
                                      {problem.status === 'Escalated' && <span className="mt-3 inline-block text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded">Escalated</span>}
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              )}

              {/* 4. ADMIN PROFILE WITH HIDDEN SECTIONS */}
              {adminTab === 'profile' && (
                 <div className="space-y-6 animate-fade-in pb-4 w-full max-w-md mx-auto">
                     
                     {!adminProfileData ? (
                         <div className="flex justify-center py-10"><span className="animate-pulse text-purple-400">Loading Profile...</span></div>
                     ) : (
                       <>
                         <div className="bg-slate-900 p-6 rounded-xl border border-purple-500/50 shadow-xl text-center relative overflow-hidden flex flex-col items-center">
                             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-900 via-purple-400 to-purple-900"></div>
                             <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-2xl mb-2 border-2 border-purple-500/50 shadow-inner">👨‍💼</div>
                             <h3 className="text-2xl font-extrabold text-white tracking-tight mt-1">{currentAdminName}</h3>
                             <div className="inline-block px-4 py-1 mt-2 bg-purple-950/50 border border-purple-500/40 rounded-full shadow-inner mb-2">
                                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">{(currentAdminRole || 'local_admin').replace('_', ' ')}</span>
                             </div>
                         </div>

                         {adminProfileSection === null ? (
                             <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-sm overflow-hidden flex flex-col">
                                 <button onClick={()=>setAdminProfileSection('lang')} className="border-b border-slate-800 p-4 flex justify-between items-center hover:bg-slate-800 transition-colors">
                                     <span className="text-sm font-bold text-slate-300">Language & Accessibility</span><span className="text-slate-500">▶</span>
                                 </button>
                                 <button onClick={()=>setAdminProfileSection('cred')} className="border-b border-slate-800 p-4 flex justify-between items-center hover:bg-slate-800 transition-colors">
                                     <span className="text-sm font-bold text-slate-300">Manage Credentials</span><span className="text-slate-500">▶</span>
                                 </button>
                                 <button onClick={()=>setAdminProfileSection('activity')} className="border-b border-slate-800 p-4 flex justify-between items-center hover:bg-slate-800 transition-colors">
                                     <span className="text-sm font-bold text-slate-300">Activity History</span><span className="text-slate-500">▶</span>
                                 </button>
                                 <button onClick={()=>setAdminProfileSection('login')} className="border-b border-slate-800 p-4 flex justify-between items-center hover:bg-slate-800 transition-colors">
                                     <span className="text-sm font-bold text-slate-300">Login Security History</span><span className="text-slate-500">▶</span>
                                 </button>
                                 <button onClick={()=>setShowProblemModal(true)} className="p-4 flex justify-between items-center hover:bg-slate-800 transition-colors">
                                     <span className="text-sm font-bold text-red-400">Report a Problem</span><span className="text-slate-500">▶</span>
                                 </button>
                             </div>
                         ) : (
                             <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 shadow-sm animate-fade-in">
                                 <button onClick={()=>setAdminProfileSection(null)} className="text-xs font-bold text-slate-400 mb-4 hover:text-white">← Back</button>
                                 
                                 {adminProfileSection === 'lang' && (
                                     <div>
                                         <h4 className="text-sm font-bold text-slate-300 mb-3">Language & Accessibility</h4>
                                         <select className="w-full bg-slate-950 border border-slate-700 text-slate-300 rounded-lg p-3 text-sm focus:border-purple-500 shadow-inner">
                                            <option value="en">English (US)</option><option value="hi">Hindi</option><option value="mr">Marathi</option>
                                         </select>
                                     </div>
                                 )}

                                 {adminProfileSection === 'cred' && (
                                     <div>
                                         <h4 className="text-sm font-bold text-slate-300 mb-3">Manage Credentials</h4>
                                         <button className="w-full py-3 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-lg text-sm font-bold text-slate-300 transition-colors">Change Admin Password</button>
                                     </div>
                                 )}

                                 {adminProfileSection === 'activity' && (
                                     <div>
                                         <h4 className="text-sm font-bold text-slate-300 mb-3">Recent Activity</h4>
                                         {adminProfileData.activity_history.length === 0 ? <p className="text-xs text-slate-500 italic">No recent updates.</p> : (
                                             <div className="space-y-2">
                                                 {adminProfileData.activity_history.slice(0,4).map(act => (
                                                     <div key={act.id} className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800 shadow-inner">
                                                         <div>
                                                            <span className="text-xs font-bold text-slate-300">#{act.id}</span> <span className="text-xs text-slate-400">{act.category}</span>
                                                         </div>
                                                         <div className="text-right">
                                                            <div className="text-[10px] font-bold text-purple-400">{act.status}</div>
                                                            <div className="text-[9px] text-slate-500 font-mono mt-0.5">{act.date}</div>
                                                         </div>
                                                     </div>
                                                 ))}
                                             </div>
                                         )}
                                     </div>
                                 )}

                                 {/* ADMIN: SECURE LOGIN HISTORY W/ DEVICE INFO */}
                                 {adminProfileSection === 'login' && (
                                     <div>
                                         <h4 className="text-sm font-bold text-slate-300 mb-3">Login Sessions</h4>
                                         {adminProfileData.login_history.length === 0 ? <p className="text-xs text-slate-500 italic py-2">No login data.</p> : (
                                             <div className="space-y-2">
                                                 {adminProfileData.login_history.slice(0,3).map((log, i) => (
                                                     <div key={i} className="bg-slate-950 p-3 rounded-lg border border-slate-800 shadow-inner">
                                                         <div className="flex justify-between items-center mb-1.5">
                                                             <span className="text-xs font-mono text-slate-300">{log.ip}</span>
                                                             <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${log.session === 'Active' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>{log.session}</span>
                                                         </div>
                                                         <div className="flex flex-col gap-1 mt-2 text-[10px] text-slate-500">
                                                            <div className="flex justify-between items-center">
                                                                <span>📍 {log.location}</span>
                                                                <span className="font-mono">{log.time}</span>
                                                            </div>
                                                            <div className="truncate opacity-75">
                                                                💻 {log.device}
                                                            </div>
                                                         </div>
                                                     </div>
                                                 ))}
                                             </div>
                                         )}
                                     </div>
                                 )}
                             </div>
                         )}

                         <button onClick={handleAdminLogout} className="w-full py-4 bg-slate-900 border border-red-500/30 hover:bg-red-900/20 rounded-xl font-bold text-red-400 text-sm transition-colors shadow-sm">
                              Secure Log Out
                          </button>
                       </>
                     )}
                 </div>
              )}

              {/* ADMIN BUG MODAL */}
              {showProblemModal && (
                  <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
                      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
                          <h3 className="text-xl font-bold text-purple-400 mb-4">Report a Problem</h3>
                          <form onSubmit={submitProblem}>
                              <textarea value={problemForm} onChange={(e)=>setProblemForm(e.target.value)} required rows="4" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:border-purple-500 mb-4" placeholder="Describe the problem or platform bug..."></textarea>
                              <div className="flex gap-2">
                                  <button type="button" onClick={() => setShowProblemModal(false)} className="flex-1 py-2 bg-slate-800 rounded-lg font-bold text-slate-300">Cancel</button>
                                  <button type="submit" className="flex-[2] py-2 bg-purple-500 text-slate-950 rounded-lg font-bold">Submit to Super Admin</button>
                              </div>
                          </form>
                      </div>
                  </div>
              )}
          </div>

          {/* ADMIN BOTTOM NAVIGATION BAR (Matches Wireframe) */}
          <div className="absolute bottom-0 w-full bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex justify-between px-2 pb-safe pt-2 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
              {isSuperAdmin ? (
                  <>
                      <button onClick={() => { setAdminTab('dashboard'); setSelectedAdminIssueId(null); }} className={`flex flex-col items-center p-2 flex-1 transition-colors ${adminTab === 'dashboard' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}>
                          <span className="text-xl mb-1">📊</span><span className="text-[9px] md:text-[10px] font-bold tracking-wide">Dashboard</span>
                      </button>
                      <button onClick={() => { setAdminTab('real_time_report'); setSelectedAdminIssueId(null); loadSuperAdminStats(); }} className={`flex flex-col items-center p-2 flex-1 transition-colors ${adminTab === 'real_time_report' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}>
                          <span className="text-xl mb-1">📈</span><span className="text-[9px] md:text-[10px] font-bold tracking-wide">Real-Time</span>
                      </button>
                      <button onClick={() => { setAdminTab('users'); setSelectedAdminIssueId(null); fetchSystemAdmins(); }} className={`flex flex-col items-center p-2 flex-1 transition-colors ${adminTab === 'users' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}>
                          <span className="text-xl mb-1">🛡️</span><span className="text-[9px] md:text-[10px] font-bold tracking-wide">Admins</span>
                      </button>
                      <button onClick={() => { setAdminTab('bugs'); setSelectedAdminIssueId(null); loadProblems(true); }} className={`flex flex-col items-center p-2 flex-1 transition-colors ${adminTab === 'bugs' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}>
                          <span className="text-xl mb-1">🐞</span><span className="text-[9px] md:text-[10px] font-bold tracking-wide">Problems</span>
                      </button>
                      <button onClick={() => { setAdminTab('profile'); setSelectedAdminIssueId(null); setAdminProfileSection(null); }} className={`flex flex-col items-center p-2 flex-1 transition-colors ${adminTab === 'profile' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}>
                          <span className="text-xl mb-1">👤</span><span className="text-[9px] md:text-[10px] font-bold tracking-wide">Profile</span>
                      </button>
                  </>
              ) : (
                  <>
                      <button onClick={() => { setAdminTab('dashboard'); setSelectedAdminIssueId(null); }} className={`flex flex-col items-center p-2 flex-1 transition-colors ${adminTab === 'dashboard' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}>
                          <span className="text-xl mb-1">📊</span><span className="text-[10px] font-bold tracking-wide">Dashboard</span>
                      </button>
                      <button onClick={() => { setAdminTab('issues'); setSelectedAdminIssueId(null); loadAdminDashboardData(); }} className={`flex flex-col items-center p-2 flex-1 transition-colors ${adminTab === 'issues' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}>
                          <span className="text-xl mb-1">📋</span><span className="text-[10px] font-bold tracking-wide">Manage Issues</span>
                      </button>
                      <button onClick={() => { setAdminTab('bugs'); setSelectedAdminIssueId(null); loadProblems(true); }} className={`flex flex-col items-center p-2 flex-1 transition-colors ${adminTab === 'bugs' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}>
                          <span className="text-xl mb-1">🐞</span><span className="text-[10px] font-bold tracking-wide">Problems</span>
                      </button>
                      <button onClick={() => { setAdminTab('profile'); setSelectedAdminIssueId(null); setAdminProfileSection(null); }} className={`flex flex-col items-center p-2 flex-1 transition-colors ${adminTab === 'profile' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}>
                          <span className="text-xl mb-1">👤</span><span className="text-[10px] font-bold tracking-wide">Profile</span>
                      </button>
                  </>
              )}
          </div>
        </div>
      );
  };

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans w-full ${currentView === 'home' || currentView.includes('login') ? 'items-center' : ''}`}>
      {currentView === 'home' && renderHome()}
      {currentView === 'citizen_login' && renderCitizenLogin()}
      {currentView === 'citizen' && renderCitizenPortal()}
      {currentView === 'admin_login' && renderAdminLogin()}
      {currentView === 'admin' && renderAdminPortal()}
    </div>
  );
}

export default App;