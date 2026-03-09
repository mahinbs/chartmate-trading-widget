import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Loader2, PlusCircle, Trash2, Save, ArrowLeft,
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  Quote, Link2, Minus, Image as ImageIcon, Upload, ChevronDown,
} from "lucide-react";

const BLOCK_OPTIONS = [
  { label: "Normal", tag: "p" },
  { label: "Heading 1", tag: "h1" },
  { label: "Heading 2", tag: "h2" },
  { label: "Heading 3", tag: "h3" },
  { label: "Heading 4", tag: "h4" },
  { label: "Quote", tag: "blockquote" },
];

interface BlogRow {
  id: string;
  slug: string | null;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  author_image_url: string | null;
  content_html: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  category: string | null;
  read_time: string | null;
}

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const EMPTY_BLOG: BlogRow = {
  id: "", slug: "", title: "", subtitle: "", cover_image_url: "",
  author_name: "Trading Smart", author_image_url: "", content_html: "",
  is_published: false, published_at: null, created_at: "",
  category: "Trading", read_time: "5 min read",
};

function formatDate(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ── WYSIWYG Rich Text Editor ─────────────────────────────────────────────────
interface RichEditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
}

function RichEditor({ initialHtml, onChange }: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [blockTag, setBlockTag] = useState("p");
  const [hasSelection, setHasSelection] = useState(false);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [showImageForm, setShowImageForm] = useState(false);
  const [imageUrl, setImageUrl] = useState("https://");

  useEffect(() => {
    if (!initialized.current && editorRef.current) {
      editorRef.current.innerHTML = initialHtml || "";
      initialized.current = true;
    }
  }, [initialHtml]);

  const refreshState = useCallback(() => {
    // Active inline formats
    const next = new Set<string>();
    try {
      if (document.queryCommandState("bold")) next.add("bold");
      if (document.queryCommandState("italic")) next.add("italic");
      if (document.queryCommandState("underline")) next.add("underline");
      if (document.queryCommandState("strikeThrough")) next.add("strike");
      if (document.queryCommandState("insertUnorderedList")) next.add("ul");
      if (document.queryCommandState("insertOrderedList")) next.add("ol");
    } catch { /* ignore in non-selection context */ }
    setActive(next);

    // Block type
    try {
      const val = (document.queryCommandValue("formatBlock") || "p").toLowerCase().replace(/[<>]/g, "");
      setBlockTag(val || "p");
    } catch { setBlockTag("p"); }

    // Selection presence
    const sel = window.getSelection();
    const root = editorRef.current;
    setHasSelection(!!(root && sel && !sel.isCollapsed && root.contains(sel.anchorNode)));
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshState);
    return () => document.removeEventListener("selectionchange", refreshState);
  }, [refreshState]);

  const exec = useCallback((cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val ?? undefined);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
    refreshState();
  }, [onChange, refreshState]);

  const setBlock = useCallback((tag: string) => {
    setShowBlockMenu(false);
    exec("formatBlock", tag);
  }, [exec]);

  const rememberSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !savedRangeRef.current) return;
    sel.removeAllRanges();
    sel.addRange(savedRangeRef.current);
  }, []);

  const openLinkForm = useCallback(() => {
    rememberSelection();
    setShowImageForm(false);
    setShowLinkForm(true);
  }, [rememberSelection]);

  const applyLink = useCallback(() => {
    if (!linkUrl.trim()) return;
    restoreSelection();
    exec("createLink", linkUrl.trim());
    setShowLinkForm(false);
  }, [exec, linkUrl, restoreSelection]);

  const openImageForm = useCallback(() => {
    setShowLinkForm(false);
    setShowImageForm(true);
  }, []);

  const applyImage = useCallback(() => {
    if (!imageUrl.trim()) return;
    exec("insertImage", imageUrl.trim());
    setShowImageForm(false);
  }, [exec, imageUrl]);

  const currentBlockLabel = BLOCK_OPTIONS.find((o) => o.tag === blockTag)?.label ?? "Normal";

  type Btn =
    | { cmd: string; icon: React.ReactNode; title: string; activeKey?: string; requiresSel?: boolean }
    | { sep: true };

  const buttons: Btn[] = [
    { cmd: "bold",                icon: <Bold className="h-3.5 w-3.5" />,          title: "Bold",           activeKey: "bold" },
    { cmd: "italic",              icon: <Italic className="h-3.5 w-3.5" />,         title: "Italic",         activeKey: "italic" },
    { cmd: "underline",           icon: <Underline className="h-3.5 w-3.5" />,      title: "Underline",      activeKey: "underline" },
    { cmd: "strikeThrough",       icon: <Strikethrough className="h-3.5 w-3.5" />,  title: "Strikethrough",  activeKey: "strike" },
    { sep: true },
    { cmd: "insertUnorderedList", icon: <List className="h-3.5 w-3.5" />,           title: "Bullet list",    activeKey: "ul" },
    { cmd: "insertOrderedList",   icon: <ListOrdered className="h-3.5 w-3.5" />,    title: "Numbered list",  activeKey: "ol" },
    { sep: true },
    { cmd: "__link",              icon: <Link2 className="h-3.5 w-3.5" />,          title: "Insert link",    requiresSel: true },
    { cmd: "__image",             icon: <ImageIcon className="h-3.5 w-3.5" />,      title: "Insert image" },
  ];

  return (
    <div className="border border-input rounded-md overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 bg-muted/60 border-b border-input select-none">

        {/* Block type dropdown */}
        <div className="relative mr-1">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setShowBlockMenu((v) => !v); }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-background border border-input hover:border-primary transition-colors min-w-[90px] justify-between"
          >
            <span>{currentBlockLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          {showBlockMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[130px]">
              {BLOCK_OPTIONS.map((opt) => (
                <button
                  key={opt.tag}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setBlock(opt.tag); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors ${
                    blockTag === opt.tag ? "text-primary font-semibold bg-muted" : ""
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="w-px h-5 bg-border mx-0.5 self-center" />

        {buttons.map((b, i) =>
          "sep" in b ? (
            <span key={i} className="w-px h-5 bg-border mx-0.5 self-center" />
          ) : (
            <button
              key={i}
              type="button"
              title={b.title}
              disabled={b.requiresSel && !hasSelection}
              onMouseDown={(e) => {
                e.preventDefault();
                if (b.cmd === "__link") openLinkForm();
                else if (b.cmd === "__image") openImageForm();
                else exec(b.cmd);
              }}
              className={`p-1.5 rounded transition-colors ${
                b.activeKey && active.has(b.activeKey)
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : b.requiresSel && !hasSelection
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : "text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm"
              }`}
            >
              {b.icon}
            </button>
          )
        )}
        {(showLinkForm || showImageForm) && (
          <div className="w-full mt-2 flex flex-wrap items-center gap-2 text-xs">
            {showLinkForm && (
              <>
                <span className="text-muted-foreground">Link URL</span>
                <input
                  className="flex-1 min-w-[160px] rounded border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyLink();
                    }
                  }}
                />
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyLink();
                  }}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-input text-xs"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowLinkForm(false);
                  }}
                >
                  Cancel
                </button>
              </>
            )}
            {showImageForm && (
              <>
                <span className="text-muted-foreground">Image URL</span>
                <input
                  className="flex-1 min-w-[160px] rounded border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyImage();
                    }
                  }}
                />
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyImage();
                  }}
                >
                  Insert
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-input text-xs"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowImageForm(false);
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Editable area — must have explicit list styles */}
      <style>{`
        .rich-editor ul { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
        .rich-editor ol { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0; }
        .rich-editor li { margin: 0.2em 0; }
        .rich-editor blockquote { border-left: 3px solid #6366f1; padding-left: 1em; color: #9ca3af; margin: 0.5em 0; }
        .rich-editor h1 { font-size: 2em; font-weight: 700; margin: 0.4em 0; }
        .rich-editor h2 { font-size: 1.5em; font-weight: 700; margin: 0.4em 0; }
        .rich-editor h3 { font-size: 1.25em; font-weight: 700; margin: 0.3em 0; }
        .rich-editor h4 { font-size: 1.1em; font-weight: 600; margin: 0.3em 0; }
        .rich-editor p  { margin: 0.25em 0; }
        .rich-editor a  { color: #6366f1; text-decoration: underline; }
        .rich-editor img { max-width: 100%; border-radius: 6px; margin: 0.5em 0; }
        .rich-editor hr { border: none; border-top: 1px solid #374151; margin: 1em 0; }
      `}</style>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="rich-editor min-h-[360px] p-4 outline-none text-sm leading-relaxed overflow-y-auto focus:ring-0"
        style={{ wordBreak: "break-word" }}
        onInput={() => { if (editorRef.current) onChange(editorRef.current.innerHTML); }}
        onKeyUp={refreshState}
        onMouseUp={refreshState}
        onFocus={refreshState}
        onClick={() => setShowBlockMenu(false)}
      />
    </div>
  );
}

// ── Image uploader helper ─────────────────────────────────────────────────────
async function uploadToStorage(file: File, folder: string): Promise<string> {
  const path = `${folder}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const { error } = await supabase.storage.from("blog-images").upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("blog-images").getPublicUrl(path);
  return data.publicUrl;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminBlogsPage() {
  const [blogs, setBlogs] = useState<BlogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<BlogRow>(EMPTY_BLOG);
  const [uploading, setUploading] = useState<"cover" | "avatar" | null>(null);

  // Track content separately so the editor doesn't re-mount on every keystroke
  const contentRef = useRef<string>("");

  const loadBlogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("blogs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setBlogs((data as any[]) || []);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load blogs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBlogs(); }, []);

  const openNew = () => {
    const fresh = { ...EMPTY_BLOG, created_at: new Date().toISOString() };
    contentRef.current = "";
    setEditing(fresh);
    setView("edit");
  };

  const openEdit = (b: BlogRow) => {
    contentRef.current = b.content_html || "";
    setEditing({ ...b });
    setView("edit");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this blog post?")) return;
    try {
      const { error } = await supabase.from("blogs").delete().eq("id", id);
      if (error) throw error;
      toast.success("Deleted");
      setBlogs((prev) => prev.filter((b) => b.id !== id));
      if (editing.id === id) setView("list");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    }
  };

  const handleFileUpload = async (file: File | undefined, kind: "cover" | "avatar") => {
    if (!file) return;
    setUploading(kind);
    try {
      const folder = kind === "cover" ? "cover" : "avatar";
      const url = await uploadToStorage(file, folder);
      setEditing((prev) => ({
        ...prev,
        ...(kind === "cover" ? { cover_image_url: url } : { author_image_url: url }),
      }));
      toast.success(`${kind === "cover" ? "Cover image" : "Author photo"} uploaded`);
    } catch (e: any) {
      toast.error(e?.message || `Upload failed. Make sure the blog-images storage bucket exists and is public.`);
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (!editing.title.trim()) { toast.error("Title is required"); return; }
    const slug = editing.slug?.trim() || slugify(editing.title);
    try {
      setSaving(true);
      const isNew = !editing.id;
      const payload: Partial<BlogRow> = {
        ...editing,
        slug,
        content_html: contentRef.current,
        published_at: editing.is_published
          ? editing.published_at || new Date().toISOString()
          : null,
      };
      delete (payload as any).id;
      const { data, error } = isNew
        ? await supabase.from("blogs").insert(payload).select("*").single()
        : await supabase.from("blogs").update(payload).eq("id", editing.id).select("*").single();
      if (error) throw error;
      toast.success("Blog saved");
      const saved = data as BlogRow;
      setEditing(saved);
      setBlogs((prev) => [saved, ...prev.filter((b) => b.id !== saved.id)]);
      setView("list");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // ── List view ────────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Blog Manager</h2>
            <p className="text-sm text-muted-foreground">Create and manage public blog posts.</p>
          </div>
          <Button size="sm" onClick={openNew}>
            <PlusCircle className="h-4 w-4 mr-1" /> New Blog Post
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : blogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blogs yet. Click &quot;New Blog Post&quot; to create one.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blogs.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium max-w-xs truncate">{b.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{b.category || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={b.is_published ? "default" : "secondary"}>
                      {b.is_published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {b.published_at ? formatDate(b.published_at) : "—"}
                  </TableCell>
                  <TableCell className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(b)}>Edit</Button>
                    <Button
                      size="sm" variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => handleDelete(b.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    );
  }

  // ── Edit view ────────────────────────────────────────────────────────────────
  const postDateValue = editing.published_at
    ? new Date(editing.published_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-0 -m-6">
      {/* Top bar */}
      <div className="border-b bg-card/80 px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => setView("list")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back to list
        </Button>
        <div className="ml-2">
          <h2 className="text-base font-semibold">{editing.id ? "Edit Blog Post" : "New Blog Post"}</h2>
          {editing.id && <p className="text-xs text-muted-foreground">ID: {editing.slug || editing.id}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setView("list")}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-3xl mx-auto">

        {/* Title */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Post Title <span className="text-red-500">*</span></Label>
          <Input
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="e.g. Why Every Trader Needs AI Market Analysis"
            className="text-base"
          />
        </div>

        {/* Category + Read Time */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Category <span className="text-red-500">*</span></Label>
            <Input value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="Trading" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Read Time</Label>
            <Input value={editing.read_time || ""} onChange={(e) => setEditing({ ...editing, read_time: e.target.value })} placeholder="5 min read" />
          </div>
        </div>

        {/* Short Excerpt */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Short Excerpt <span className="text-red-500">*</span></Label>
          <Textarea
            rows={3}
            value={editing.subtitle || ""}
            onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
            placeholder="A short summary shown on the blog card listing…"
          />
        </div>

        {/* Author name + Post date */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Author name <span className="text-red-500">*</span></Label>
            <Input value={editing.author_name || ""} onChange={(e) => setEditing({ ...editing, author_name: e.target.value })} placeholder="Trading Smart" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Post date <span className="text-red-500">*</span></Label>
            <Input
              type="date"
              value={postDateValue}
              onChange={(e) => setEditing({ ...editing, published_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
            <p className="text-[11px] text-muted-foreground">Defaults to current date. You can set a past date.</p>
          </div>
        </div>

        {/* Author profile picture */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Author profile picture</Label>
          <div className="flex items-center gap-2">
            <Input
              value={editing.author_image_url || ""}
              onChange={(e) => setEditing({ ...editing, author_image_url: e.target.value })}
              placeholder="https://example.com/avatar.jpg or upload →"
              className="flex-1"
            />
            <label className="cursor-pointer shrink-0">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="gap-1.5 pointer-events-none"
                disabled={uploading === "avatar"}
              >
                <span>
                  {uploading === "avatar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload photo
                </span>
              </Button>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files?.[0], "avatar")}
              />
            </label>
          </div>
          {editing.author_image_url && (
            <div className="flex items-center gap-2 mt-1">
              <img src={editing.author_image_url} alt="Author" className="h-10 w-10 rounded-full object-cover border border-border" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span className="text-xs text-muted-foreground">Preview</span>
            </div>
          )}
        </div>

        {/* Featured image */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Featured Image <span className="text-red-500">*</span></Label>
          <div className="flex items-center gap-2">
            <Input
              value={editing.cover_image_url || ""}
              onChange={(e) => setEditing({ ...editing, cover_image_url: e.target.value })}
              placeholder="https://example.com/cover.jpg or upload →"
              className="flex-1"
            />
            <label className="cursor-pointer shrink-0">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="gap-1.5 pointer-events-none"
                disabled={uploading === "cover"}
              >
                <span>
                  {uploading === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                  Upload image
                </span>
              </Button>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files?.[0], "cover")}
              />
            </label>
          </div>
          {editing.cover_image_url && (
            <img
              src={editing.cover_image_url}
              alt="Cover"
              className="mt-2 w-full max-h-52 object-cover rounded-xl border border-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
        </div>

        {/* URL slug */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">URL Slug</Label>
          <Input
            value={editing.slug || ""}
            onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
            placeholder="auto-generated-from-title"
          />
          <p className="text-[11px] text-muted-foreground">Leave blank to auto-generate from the title.</p>
        </div>

        {/* WYSIWYG Content editor */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Main Content <span className="text-red-500">*</span></Label>
          <RichEditor
            initialHtml={editing.content_html || ""}
            onChange={(html) => { contentRef.current = html; }}
          />
          <p className="text-[11px] text-muted-foreground">
            Use the toolbar to format text — bold, italic, headings, lists, links. Works like a word processor.
          </p>
        </div>

        {/* Publish toggle */}
        <div className="flex items-center gap-2.5 pt-2">
          <input
            id="published"
            type="checkbox"
            checked={editing.is_published}
            onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })}
            className="h-4 w-4"
          />
          <Label htmlFor="published" className="text-sm cursor-pointer">
            Publish immediately (visible to all users on the public blogs page)
          </Label>
        </div>

        {/* Save / Cancel */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t">
          <Button variant="outline" onClick={() => setView("list")}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
