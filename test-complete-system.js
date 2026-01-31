// Complete end-to-end test with all new features
const SUPABASE_URL = 'https://ssesqiqtndhurfyntgbm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzZXNxaXF0bmRodXJmeW50Z2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwMzYzMTgsImV4cCI6MjA3MTYxMjMxOH0.xhp4AYRUbGEWciOaxnZgxQHAmRrEAKry9T1NrXQXRso';

async function testCompleteSystem() {
  console.log('🚀 Testing Complete System with ALL New Features\n');
  console.log('=' .repeat(70));

  const testPayload = {
    symbol: 'AAPL',
    investment: 10000,
    timeframe: '1h',
    horizons: [60, 240, 1440], // 1h, 4h, 1d
    
    // User Profile
    riskTolerance: 'high',
    tradingStyle: 'swing_trading',
    investmentGoal: 'growth',
    stopLossPercentage: 5,
    targetProfitPercentage: 15,
    
    // NEW: Leverage & Margin
    leverage: 3,
    marginType: 'margin'
  };

  console.log('📊 Test Configuration:');
  console.log('Symbol:', testPayload.symbol);
  console.log('Investment:', `₹${testPayload.investment.toLocaleString()}`);
  console.log('Risk:', testPayload.riskTolerance.toUpperCase());
  console.log('Style:', testPayload.tradingStyle.replace(/_/g, ' ').toUpperCase());
  console.log('Account:', testPayload.marginType.toUpperCase());
  console.log('Leverage:', `${testPayload.leverage}x ⚠️`);
  console.log('Stop Loss:', `${testPayload.stopLossPercentage}%`);
  console.log('Target:', `${testPayload.targetProfitPercentage}%`);
  console.log('\n⏳ Calling API...\n');

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

    console.log(`✅ API Response Received in ${duration}s`);
    console.log('=' .repeat(70));
    
    // Test 1: Action Signal
    console.log('\n🎯 TEST 1: ACTION SIGNAL');
    console.log('-' .repeat(70));
    if (result.geminiForecast?.action_signal) {
      console.log('✅ Action:', result.geminiForecast.action_signal.action);
      console.log('✅ Confidence:', result.geminiForecast.action_signal.confidence + '%');
      console.log('✅ Urgency:', result.geminiForecast.action_signal.urgency);
    } else {
      console.log('❌ Action signal not found');
    }

    // Test 2: Risk Grade
    console.log('\n🛡️  TEST 2: RISK GRADE');
    console.log('-' .repeat(70));
    if (result.geminiForecast?.risk_grade) {
      console.log('✅ Risk Level:', result.geminiForecast.risk_grade);
      const emoji = {
        'LOW': '🟢',
        'MEDIUM': '🟡',
        'HIGH': '🟠',
        'VERY_HIGH': '🔴'
      }[result.geminiForecast.risk_grade];
      console.log(`   ${emoji} ${result.geminiForecast.risk_grade} RISK`);
    } else {
      console.log('❌ Risk grade not found');
    }

    // Test 3: Expected ROI
    console.log('\n💰 TEST 3: EXPECTED ROI');
    console.log('-' .repeat(70));
    if (result.geminiForecast?.expected_roi) {
      const roi = result.geminiForecast.expected_roi;
      const inv = testPayload.investment;
      console.log('✅ Best Case:  ', `+₹${(inv * roi.best_case / 100).toLocaleString()} (+${roi.best_case}%)`);
      console.log('✅ Likely Case:', `+₹${(inv * roi.likely_case / 100).toLocaleString()} (+${roi.likely_case}%)`);
      console.log('✅ Worst Case: ', `₹${(inv * roi.worst_case / 100).toLocaleString()} (${roi.worst_case}%)`);
    } else {
      console.log('❌ Expected ROI not found');
    }

    // Test 4: Position Sizing
    console.log('\n📦 TEST 4: POSITION SIZING');
    console.log('-' .repeat(70));
    if (result.positionSize) {
      console.log('✅ Shares to buy:', result.positionSize.shares);
      console.log('✅ Price per share:', `₹${result.positionSize.costPerShare.toFixed(2)}`);
      console.log('✅ Total cost:', `₹${result.positionSize.totalCost.toLocaleString()}`);
      if (result.positionSize.remainingCash !== undefined) {
        console.log('✅ Remaining cash:', `₹${result.positionSize.remainingCash.toFixed(2)}`);
      }
    } else {
      console.log('❌ Position sizing not found');
    }

    // Test 5: Leverage Info
    console.log('\n⚡ TEST 5: LEVERAGE INFO');
    console.log('-' .repeat(70));
    if (result.leverage) {
      console.log('✅ Leverage:', result.leverage + 'x');
      console.log('✅ Margin Type:', (result.marginType || 'cash').toUpperCase());
      console.log('✅ Total Exposure:', `₹${(testPayload.investment * result.leverage).toLocaleString()}`);
    } else {
      console.log('❌ Leverage info not found');
    }

    // Test 6: Recommended Holding Period
    console.log('\n⏰ TEST 6: RECOMMENDED HOLDING PERIOD');
    console.log('-' .repeat(70));
    if (result.geminiForecast?.positioning_guidance?.recommended_hold_period) {
      console.log('✅ AI Recommends:', result.geminiForecast.positioning_guidance.recommended_hold_period);
    } else {
      console.log('⚠️  No specific recommendation (may need Gemini 3 Pro response)');
    }

    // Summary
    console.log('\n' + '=' .repeat(70));
    console.log('🎉 COMPLETE SYSTEM TEST RESULTS');
    console.log('=' .repeat(70));
    
    const tests = [
      result.geminiForecast?.action_signal,
      result.geminiForecast?.risk_grade,
      result.geminiForecast?.expected_roi,
      result.positionSize,
      result.leverage,
      result.geminiForecast?.positioning_guidance
    ];
    
    const passed = tests.filter(Boolean).length;
    const total = tests.length;
    
    console.log(`Tests Passed: ${passed}/${total}`);
    console.log(`Success Rate: ${((passed/total) * 100).toFixed(1)}%`);
    
    if (passed === total) {
      console.log('\n✅ ALL FEATURES WORKING! System ready for production!');
    } else {
      console.log(`\n⚠️  ${total - passed} features need attention`);
    }

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error.message);
  }
}

testCompleteSystem();
