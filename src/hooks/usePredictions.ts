
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Prediction {
  id: string;
  user_id: string;
  symbol: string;
  timeframe: string;
  investment?: number;
  current_price?: number;
  expected_move_percent?: number;
  expected_move_direction?: string;
  price_target_min?: number;
  price_target_max?: number;
  recommendation?: string;
  confidence?: number;
  patterns?: any;
  key_levels?: any;
  risks?: any;
  opportunities?: any;
  rationale?: string;
  raw_response?: any;
  created_at: string;
  updated_at: string;
}

export const usePredictions = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: predictions, isLoading, error } = useQuery({
    queryKey: ['predictions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Prediction[];
    },
  });

  const savePrediction = useMutation({
    mutationFn: async (prediction: Omit<Prediction, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('predictions')
        .insert([prediction])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['predictions'] });
      toast({
        title: "Prediction saved!",
        description: "Your prediction has been saved successfully.",
      });
    },
    onError: (error) => {
      console.error('Error saving prediction:', error);
      toast({
        title: "Error saving prediction",
        description: "There was an issue saving your prediction. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deletePrediction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('predictions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['predictions'] });
      toast({
        title: "Prediction deleted",
        description: "Your prediction has been deleted successfully.",
      });
    },
    onError: (error) => {
      console.error('Error deleting prediction:', error);
      toast({
        title: "Error deleting prediction",
        description: "There was an issue deleting your prediction. Please try again.",
        variant: "destructive",
      });
    },
  });

  return {
    predictions: predictions || [],
    isLoading,
    error,
    savePrediction: savePrediction.mutate,
    deletePrediction: deletePrediction.mutate,
    isSaving: savePrediction.isPending,
    isDeleting: deletePrediction.isPending,
  };
};
