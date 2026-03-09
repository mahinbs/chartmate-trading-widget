import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock } from "lucide-react";

interface Blog {
  id: string;
  slug: string | null;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  author_image_url: string | null;
  published_at: string | null;
  created_at: string;
  content_html: string | null;
  category: string | null;
  read_time: string | null;
}

function formatDate(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function BlogDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!slug) {
        setBlog(null);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        // Try by slug first (what cards use), then fall back to id
        let { data, error } = await supabase
          .from("blogs")
          .select("*")
          .eq("slug", slug)
          .eq("is_published", true)
          .maybeSingle();

        if (!data && !error) {
          const byId = await supabase
            .from("blogs")
            .select("*")
            .eq("id", slug)
            .eq("is_published", true)
            .maybeSingle();
          data = byId.data;
          error = byId.error;
        }

        if (error) throw error;
        setBlog((data as any) ?? null);
      } catch (e) {
        console.error("Failed to load blog", e);
        setBlog(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky nav */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link to="/blogs">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to all articles
            </Button>
          </Link>
          {blog?.category && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{blog.category}</Badge>
          )}
          {blog?.read_time && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground border border-border/40 rounded-full px-2.5 py-0.5">
              <Clock className="h-3 w-3" />{blog.read_time}
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="max-w-4xl mx-auto px-6 py-20 space-y-4 animate-pulse">
          <div className="h-10 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="h-80 bg-muted rounded" />
        </div>
      )}

      {!loading && !blog && (
        <div className="max-w-4xl mx-auto px-6 py-20 text-center text-muted-foreground">
          <p className="text-sm">This article could not be found or is no longer published.</p>
          <Link to="/blogs" className="mt-4 inline-block text-primary text-sm underline">Back to blogs</Link>
        </div>
      )}

      {blog && (
        <article>
          {/* Header section */}
          <div className="max-w-4xl mx-auto px-6 pt-10 pb-6">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-6">
              {blog.title}
            </h1>

            {/* Author row */}
            <div className="flex items-center gap-3 pb-6 border-b border-border/40">
              {blog.author_image_url ? (
                <img
                  src={blog.author_image_url}
                  alt={blog.author_name || "Author"}
                  className="h-11 w-11 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="h-11 w-11 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
                  {(blog.author_name || "T").charAt(0)}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold leading-tight">{blog.author_name || "Trading Smart"}</p>
                <p className="text-xs text-muted-foreground">{formatDate(blog.published_at || blog.created_at)}</p>
              </div>
            </div>
          </div>

          {/* Full-bleed featured image */}
          {blog.cover_image_url && (
            <div className="w-full overflow-hidden bg-muted mb-8" style={{ maxHeight: 560 }}>
              <img
                src={blog.cover_image_url}
                alt={blog.title}
                className="w-full object-cover"
                style={{ maxHeight: 560 }}
                loading="lazy"
              />
            </div>
          )}

          {/* Content body */}
          <div className="max-w-4xl mx-auto px-6 pb-20">
            {blog.subtitle && (
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 font-medium">
                {blog.subtitle}
              </p>
            )}

            <div
              className="
                prose prose-neutral dark:prose-invert max-w-none text-base leading-relaxed
                prose-headings:font-bold prose-headings:tracking-tight
                prose-h1:text-3xl prose-h1:mt-8 prose-h1:mb-4
                prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-3
                prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-2
                prose-h4:text-lg prose-h4:mt-5 prose-h4:mb-2
                prose-p:my-3 prose-p:text-foreground/90
                prose-li:text-foreground/90 prose-li:my-1
                prose-ul:my-3 prose-ol:my-3
                prose-strong:text-foreground prose-strong:font-semibold
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                prose-blockquote:border-primary prose-blockquote:text-muted-foreground
                prose-img:rounded-xl prose-img:my-6
                prose-hr:border-border/40
              "
              dangerouslySetInnerHTML={{ __html: blog.content_html || "" }}
            />
          </div>
        </article>
      )}
    </div>
  );
}
