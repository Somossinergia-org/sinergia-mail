"use client";

import { useState, useEffect } from "react";
import { FolderOpen, File, Search, ArrowLeft, ExternalLink, HardDrive, RefreshCw } from "lucide-react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  webViewLink: string;
  isFolder: boolean;
}

export default function DrivePanel() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [folderId, setFolderId] = useState("root");
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);

  const fetchFiles = async (folder = "root", q?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      else params.set("folderId", folder);
      const res = await fetch(`/api/drive?${params}`);
      const data = await res.json();
      if (data.files) setFiles(data.files);
      if (data.error) setError(data.error);
    } catch { setError("Error cargando Drive"); }
    finally { setLoading(false); setSearching(false); }
  };

  useEffect(() => { fetchFiles(); }, []);

  const openFolder = (file: DriveFile) => {
    setFolderStack([...folderStack, { id: folderId, name: folderStack.length === 0 ? "Mi Drive" : "..." }]);
    setFolderId(file.id);
    setSearch("");
    fetchFiles(file.id);
  };

  const goBack = () => {
    if (folderStack.length === 0) return;
    const prev = folderStack[folderStack.length - 1];
    setFolderStack(folderStack.slice(0, -1));
    setFolderId(prev.id);
    fetchFiles(prev.id);
  };

  const handleSearch = () => {
    if (!search.trim()) { fetchFiles(folderId); return; }
    setSearching(true);
    fetchFiles("root", search.trim());
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getIcon = (file: DriveFile) => {
    if (file.isFolder) return <FolderOpen size={16} className="text-amber-400" />;
    if (file.mimeType?.includes("pdf")) return <File size={16} className="text-red-400" />;
    if (file.mimeType?.includes("sheet") || file.mimeType?.includes("excel")) return <File size={16} className="text-green-400" />;
    if (file.mimeType?.includes("doc") || file.mimeType?.includes("word")) return <File size={16} className="text-blue-400" />;
    if (file.mimeType?.includes("image")) return <File size={16} className="text-purple-400" />;
    return <File size={16} className="text-slate-400" />;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Google Drive</span>
        </div>
        <button onClick={() => fetchFiles(folderId)} className="text-cyan-500/60 hover:text-cyan-400 transition">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Search + nav */}
      <div className="flex items-center gap-2">
        {folderStack.length > 0 && (
          <button onClick={goBack} className="rounded-lg bg-[#0a1628] border border-[#1a2d4a] p-2 hover:border-cyan-500/30 transition">
            <ArrowLeft size={14} className="text-slate-400" />
          </button>
        )}
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Buscar en Drive..." className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] focus:border-cyan-500/50" />
        </div>
      </div>

      {/* Error */}
      {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">{error}</div>}

      {/* Files grid */}
      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
      ) : files.length === 0 ? (
        <div className="text-center py-12 text-slate-600">
          <FolderOpen size={32} className="mx-auto mb-2 text-cyan-500/20" />
          <p className="text-sm">Carpeta vacía</p>
        </div>
      ) : (
        <div className="space-y-1">
          {files.sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : a.isFolder ? -1 : 1)).map(file => (
            <div key={file.id}
              onClick={() => file.isFolder ? openFolder(file) : undefined}
              className={`flex items-center gap-3 rounded-xl bg-[#0a1628] border border-[#1a2d4a] px-4 py-3 hover:border-cyan-500/20 transition-colors group ${file.isFolder ? "cursor-pointer" : ""}`}>
              <div className="flex-shrink-0">{getIcon(file)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300 truncate group-hover:text-white transition">{file.name}</p>
                <p className="text-[10px] text-slate-600">
                  {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString("es-ES") : ""}
                  {file.size > 0 ? ` · ${formatSize(file.size)}` : ""}
                </p>
              </div>
              {!file.isFolder && file.webViewLink && (
                <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="text-slate-600 hover:text-cyan-400 transition">
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
