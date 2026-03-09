import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock } from "lucide-react";

interface BlogSummary {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  author_image_url: string | null;
  published_at: string | null;
  created_at: string;
  category: string | null;
  read_time: string | null;
}

function formatDate(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function BlogCard({ b }: { b: BlogSummary }) {
  const href = `/blogs/${b.slug || b.id}`;
  return (
    <Link to={href} className="group block">
      <div className="rounded-2xl overflow-hidden bg-card border border-border/60 hover:border-primary/40 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-0.5 h-full flex flex-col">
        {/* Image */}
        <div className="relative h-52 overflow-hidden bg-muted flex-shrink-0">
          {b.cover_image_url ? (
            <img
              src={b.cover_image_url}
              alt={b.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <span className="text-4xl font-bold text-primary/30">{b.title.charAt(0)}</span>
            </div>
          )}
          {/* Category badge overlay */}
          {b.category && (
            <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
              {b.category}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-col flex-1 p-5 gap-3">
          <h2 className="text-lg font-bold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {b.title}
          </h2>
          {b.subtitle && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {b.subtitle}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-border/40">
            <div className="flex items-center gap-2.5">
              {b.author_image_url ? (
                <img
                  src={b.author_image_url}
                  alt={b.author_name || "Author"}
                  className="h-7 w-7 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {(b.author_name || "T").charAt(0)}
                </div>
              )}
              <div>
                <p className="text-xs font-medium leading-tight">{b.author_name || "Trading Smart"}</p>
                <p className="text-[10px] text-muted-foreground">{formatDate(b.published_at || b.created_at)}</p>
              </div>
            </div>
            {b.read_time && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {b.read_time}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function BlogsPage() {
  const [blogs, setBlogs] = useState<BlogSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("blogs")
          .select("id, slug, title, subtitle, cover_image_url, author_name, author_image_url, published_at, created_at, category, read_time")
          .eq("is_published", true)
          .order("published_at", { ascending: false });
        if (error) throw error;
        setBlogs((data as any[]) || []);
      } catch (e) {
        console.error("Failed to load blogs", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-6 flex items-center gap-3">
          <Link to="/rsb-fintech-founder">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Home
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="container mx-auto px-4 pt-10 pb-6 text-center max-w-2xl">
        <Badge variant="outline" className="mb-4 text-xs tracking-widest uppercase">Insights</Badge>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
          Market Insights &amp; Research
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Deep dives into AI prediction models, market sentiment, and quantitative trading strategies.
        </p>
      </div>

      <div className="container mx-auto px-4 pb-16">
        {loading && (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-card border border-border/60 h-80 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && blogs.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">No articles published yet. Check back soon.</p>
          </div>
        )}

        {!loading && blogs.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {blogs.map((b) => (
              <BlogCard key={b.id} b={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
