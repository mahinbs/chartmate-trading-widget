import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Newspaper, TrendingUp, AlertTriangle, Target, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface NewsItem {
  time: string;
  source: string;
  headline: string;
  sentiment_score: number;
  novelty: string;
  relevance: string;
}

interface EnhancedNewsResponse {
  symbol: string;
  totalNews: number;
  overallSentiment: number;
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
  };
  newsItems: NewsItem[];
  sources: string[];
  lastUpdated: string;
  analysis: {
    summary: string;
    confidence: 'high' | 'medium' | 'low';
    coverage: 'comprehensive' | 'limited';
  };
}

interface NewsAnalysisProps {
  symbol: string;
  predictedAt?: Date;
}

export function NewsAnalysis({ symbol, predictedAt }: NewsAnalysisProps) {
  const [newsData, setNewsData] = useState<EnhancedNewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchNewsAnalysis();
  }, [symbol, predictedAt]);

  const getCacheKey = () => {
    const date = predictedAt ? predictedAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    return `enhanced-news:${symbol}:${date}`;
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
        const isExpired = Date.now() - timestamp > 2 * 60 * 60 * 1000; // 2 hours TTL for news
        
        if (!isExpired) {
          setNewsData(data);
          setLoading(false);
          return;
        }
      }

      console.log(`Fetching enhanced news analysis for ${symbol}...`);

      const { data, error: supabaseError } = await supabase.functions.invoke('analyze-news-google', {
        body: { symbol }
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
      console.log(`Enhanced news analysis loaded: ${data.totalNews || 0} news items`);

    } catch (err) {
      console.error('Error fetching enhanced news analysis:', err);
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

  const getSentimentColor = (score: number) => {
    if (typeof score !== 'number' || isNaN(score)) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (score > 0.3) return 'bg-green-100 text-green-800 border-green-200';
    if (score < -0.3) return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  };

  const getSentimentLabel = (score: number) => {
    if (typeof score !== 'number' || isNaN(score)) return 'Neutral';
    if (score > 0.3) return 'Positive';
    if (score < -0.3) return 'Negative';
    return 'Neutral';
  };

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return 'Recently';
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Recently';
    }
  };

  const getConfidenceColor = (confidence: string) => {
    if (!confidence) return 'bg-gray-100 text-gray-800 border-gray-200';
    switch (confidence) {
      case 'high': return 'bg-green-100 text-green-800 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
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

  if (!newsData || newsData.totalNews === 0) {
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

  const { analysis, newsItems, sources } = newsData;

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
              className={getConfidenceColor(newsData.analysis?.confidence || 'medium')}
            >
              {newsData.analysis?.confidence || 'medium'} Confidence
            </Badge>
            <Badge 
              variant="outline" 
              className={getSentimentColor(newsData.overallSentiment || 0)}
            >
              {getSentimentLabel(newsData.overallSentiment || 0)}
            </Badge>
          </div>
          
          <p className="text-sm text-muted-foreground leading-relaxed">
            {newsData.analysis?.summary || `Found ${newsData.totalNews} news items for ${newsData.symbol}`}
          </p>
        </div>

        {/* Key Insights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <h5 className="flex items-center gap-1.5 text-sm font-medium text-green-700">
              <TrendingUp className="h-4 w-4" />
              Overall Sentiment
            </h5>
            <p className="text-sm text-muted-foreground">
              {getSentimentLabel(newsData.overallSentiment || 0)} ({(newsData.overallSentiment || 0).toFixed(2)})
            </p>
          </div>

          <div className="space-y-2">
            <h5 className="flex items-center gap-1.5 text-sm font-medium text-blue-700">
              <Target className="h-4 w-4" />
              Coverage
            </h5>
            <p className="text-sm text-muted-foreground">
              {newsData.analysis?.coverage || 'limited'}
            </p>
          </div>

          <div className="space-y-2">
            <h5 className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Clock className="h-4 w-4" />
              Last Updated
            </h5>
            <p className="text-sm text-muted-foreground">
              {formatTimeAgo(newsData.lastUpdated || new Date().toISOString())}
            </p>
          </div>
        </div>

        {/* Recent Headlines */}
        <div className="space-y-3">
          <h4 className="font-medium">Recent Headlines</h4>
          <div className="space-y-2">
            {newsItems && newsItems.length > 0 ? (
              newsItems.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 p-2 rounded-lg bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <a 
                      href="#" // Placeholder for article URL
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:text-primary transition-colors block truncate"
                    >
                      {item.headline}
                    </a>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{item.source}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(item.time)}
                      </span>
                    </div>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No recent headlines available</p>
            )}
          </div>
        </div>

        {/* Data Source */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Sources: {sources?.length > 0 ? sources.join(', ') : 'Multiple sources'}
        </div>
      </CardContent>
    </Card>
  );
}