import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Newspaper, TrendingUp, AlertTriangle, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description?: string;
}

interface NewsAnalysis {
  summary: string;
  sentiment: {
    score: number;
    label: string;
  };
  keyDrivers: string[];
  risks: string[];
  opportunities: string[];
  notableHeadlines: string[];
}

interface NewsResponse {
  symbol: string;
  query: string;
  from: string;
  to: string;
  dataSource: string;
  articles: NewsArticle[];
  analysis: NewsAnalysis;
}

interface NewsAnalysisProps {
  symbol: string;
  predictedAt?: Date;
}

export function NewsAnalysis({ symbol, predictedAt }: NewsAnalysisProps) {
  const [newsData, setNewsData] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchNewsAnalysis();
  }, [symbol, predictedAt]);

  const getCacheKey = () => {
    const date = predictedAt ? predictedAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    return `news-google:${symbol}:${date}`;
  };

  const fetchNewsAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first
      const cacheKey = getCacheKey();
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const isExpired = Date.now() - timestamp > 6 * 60 * 60 * 1000; // 6 hours TTL
        
        if (!isExpired) {
          setNewsData(data);
          setLoading(false);
          return;
        }
      }

      // Calculate date range
      const to = predictedAt || new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      console.log(`Fetching news analysis for ${symbol}...`);

      const { data, error: supabaseError } = await supabase.functions.invoke('analyze-news-google', {
        body: {
          symbol,
          from: from.toISOString(),
          to: to.toISOString(),
          limit: 8
        }
      });

      if (supabaseError) {
        throw new Error(supabaseError.message);
      }

      if (!data) {
        throw new Error('No data received');
      }

      // Cache the result
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }));

      setNewsData(data);
      console.log(`News analysis loaded: ${data.articles?.length || 0} articles`);

    } catch (err) {
      console.error('Error fetching news analysis:', err);
      setError(err instanceof Error ? err.message : 'Failed to load news');
      toast({
        title: "News Analysis Error",
        description: "Couldn't load news analysis. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getSentimentColor = (label: string) => {
    switch (label.toLowerCase()) {
      case 'positive': return 'bg-green-100 text-green-800 border-green-200';
      case 'negative': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Recently';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            News & AI Sentiment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            News & AI Sentiment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Couldn't load news analysis. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!newsData || newsData.articles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            News & AI Sentiment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No recent news found for {symbol} in the last 7 days.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { analysis, articles } = newsData;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="h-5 w-5" />
          News & AI Sentiment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* AI Summary & Sentiment */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">AI Analysis</h4>
            <Badge 
              variant="outline" 
              className={getSentimentColor(analysis.sentiment.label)}
            >
              {analysis.sentiment.label}
            </Badge>
          </div>
          
          <p className="text-sm text-muted-foreground leading-relaxed">
            {analysis.summary}
          </p>
        </div>

        {/* Key Insights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {analysis.keyDrivers.length > 0 && (
            <div className="space-y-2">
              <h5 className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                <TrendingUp className="h-4 w-4" />
                Key Drivers
              </h5>
              <ul className="space-y-1">
                {analysis.keyDrivers.slice(0, 3).map((driver, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                    <span className="text-green-600 mt-0.5">•</span>
                    {driver}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.risks.length > 0 && (
            <div className="space-y-2">
              <h5 className="flex items-center gap-1.5 text-sm font-medium text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Risk Factors
              </h5>
              <ul className="space-y-1">
                {analysis.risks.slice(0, 3).map((risk, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                    <span className="text-red-600 mt-0.5">•</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.opportunities.length > 0 && (
            <div className="space-y-2">
              <h5 className="flex items-center gap-1.5 text-sm font-medium text-blue-700">
                <Target className="h-4 w-4" />
                Opportunities
              </h5>
              <ul className="space-y-1">
                {analysis.opportunities.slice(0, 3).map((opp, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                    <span className="text-blue-600 mt-0.5">•</span>
                    {opp}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Recent Headlines */}
        <div className="space-y-3">
          <h4 className="font-medium">Recent Headlines</h4>
          <div className="space-y-2">
            {articles.slice(0, 5).map((article, idx) => (
              <div key={idx} className="flex items-start justify-between gap-3 p-2 rounded-lg bg-muted/30">
                <div className="flex-1 min-w-0">
                  <a 
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:text-primary transition-colors block truncate"
                  >
                    {article.title}
                  </a>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{article.source}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(article.publishedAt)}
                    </span>
                  </div>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-1" />
              </div>
            ))}
          </div>
        </div>

        {/* Data Source */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Source: {newsData.dataSource} • Query: "{newsData.query}"
        </div>
      </CardContent>
    </Card>
  );
}