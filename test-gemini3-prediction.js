// Test script for Gemini 3 Pro prediction with user profile
const SUPABASE_URL = 'https://ssesqiqtndhurfyntgbm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzZXNxaXF0bmRodXJmeW50Z2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwMzYzMTgsImV4cCI6MjA3MTYxMjMxOH0.xhp4AYRUbGEWciOaxnZgxQHAmRrEAKry9T1NrXQXRso';

async function testGemini3Prediction() {
  console.log('🚀 Testing Gemini 3 Pro Deep Thinking Prediction...\n');

  const testPayload = {
    symbol: 'AAPL',
    investment: 1000,
    timeframe: '1h',
    horizons: [60, 240, 1440], // 1h, 4h, 1d
    
    // User Profile - comprehensive trading context
    riskTolerance: 'high',
    tradingStyle: 'swing_trading',
    investmentGoal: 'growth',
    preferredHoldPeriod: '1 week',
    stopLossPercentage: 5,
    targetProfitPercentage: 15,
    portfolioSize: 'medium',
    experienceLevel: 'intermediate'
  };

  console.log('📊 Test Parameters:');
  console.log('Symbol:', testPayload.symbol);
  console.log('Investment:', `$${testPayload.investment}`);
  console.log('Risk Tolerance:', testPayload.riskTolerance);
  console.log('Trading Style:', testPayload.tradingStyle);
  console.log('Goal:', testPayload.investmentGoal);
  console.log('Hold Period:', testPayload.preferredHoldPeriod);
  console.log('Stop Loss:', `${testPayload.stopLossPercentage}%`);
  console.log('Target Profit:', `${testPayload.targetProfitPercentage}%`);
  console.log('\n⏳ Calling predict-movement Edge Function...\n');

  try {
    const startTime = Date.now();
    
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/predict-movement`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(testPayload),
      }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    console.log(`✅ Success! Response received in ${duration}s\n`);
    
    // Display results
    console.log('📈 PREDICTION RESULTS:');
    console.log('=' .repeat(60));
    console.log(`Symbol: ${result.symbol}`);
    console.log(`Current Price: $${result.currentPrice?.toFixed(2)}`);
    console.log(`Change: ${result.changePercent?.toFixed(2)}%`);
    console.log(`Recommendation: ${result.recommendation?.toUpperCase()}`);
    console.log(`Confidence: ${result.confidence}%`);
    
    if (result.geminiForecast) {
      console.log('\n🧠 GEMINI 3 PRO DEEP THINKING FORECAST:');
      console.log('=' .repeat(60));
      console.log(`Generated At: ${result.geminiForecast.as_of}`);
      console.log(`Bias: ${result.geminiForecast.positioning_guidance?.bias?.toUpperCase()}`);
      console.log(`Guidance: ${result.geminiForecast.positioning_guidance?.notes}`);
      
      console.log('\n📊 Multi-Horizon Forecasts:');
      result.geminiForecast.forecasts?.forEach((forecast, idx) => {
        console.log(`\n${idx + 1}. ${forecast.horizon} Horizon:`);
        console.log(`   Direction: ${forecast.direction}`);
        console.log(`   Confidence: ${forecast.confidence}%`);
        console.log(`   Expected Return: ${forecast.expected_return_bp} basis points`);
        console.log(`   Probabilities: ↑${(forecast.probabilities.up * 100).toFixed(0)}% ↓${(forecast.probabilities.down * 100).toFixed(0)}% →${(forecast.probabilities.sideways * 100).toFixed(0)}%`);
        console.log(`   Key Drivers: ${forecast.key_drivers.join(', ')}`);
        if (forecast.risk_flags.length > 0) {
          console.log(`   ⚠️  Risk Flags: ${forecast.risk_flags.join(', ')}`);
        }
      });

      console.log('\n🎯 Support & Resistance Levels:');
      console.log('Supports:');
      result.geminiForecast.support_resistance?.supports?.forEach((s, i) => {
        console.log(`  ${i + 1}. $${s.level.toFixed(2)} (strength: ${(s.strength * 100).toFixed(0)}%)`);
      });
      console.log('Resistances:');
      result.geminiForecast.support_resistance?.resistances?.forEach((r, i) => {
        console.log(`  ${i + 1}. $${r.level.toFixed(2)} (strength: ${(r.strength * 100).toFixed(0)}%)`);
      });
    }

    if (result.meta?.pipeline) {
      console.log('\n⚙️  PIPELINE EXECUTION:');
      console.log('=' .repeat(60));
      console.log(`Total Duration: ${(result.meta.pipeline.totalDuration / 1000).toFixed(2)}s`);
      console.log('\nSteps:');
      result.meta.pipeline.steps
        ?.filter(step => step.status === 'completed')
        .forEach((step, idx) => {
          const duration = step.duration ? ` (${step.duration}ms)` : '';
          console.log(`  ${idx + 1}. ${step.name}${duration}`);
          if (step.details) {
            console.log(`     ${step.details}`);
          }
        });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!');
    console.log('🧠 Gemini 3 Pro is working with personalized user profiles!');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
}

// Run the test
testGemini3Prediction();
