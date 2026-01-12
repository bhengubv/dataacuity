<?php
/**
 * DataAcuity - Payment Success Page
 */

$plan = $_GET['plan'] ?? 'starter';
$isFree = $plan === 'free';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to DataAcuity!</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .success-card {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            text-align: center;
        }
        .checkmark {
            width: 80px;
            height: 80px;
            background: #38ef7d;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            font-size: 40px;
        }
        h1 {
            font-size: 28px;
            color: #1a1a2e;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
        }
        .features {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
        }
        .features h3 {
            color: #1a1a2e;
            margin-bottom: 15px;
        }
        .features ul {
            list-style: none;
        }
        .features li {
            padding: 8px 0;
            color: #444;
            display: flex;
            align-items: center;
        }
        .features li::before {
            content: '✓';
            color: #38ef7d;
            font-weight: bold;
            margin-right: 10px;
        }
        .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            padding: 15px 40px;
            border-radius: 30px;
            font-weight: 600;
            font-size: 16px;
            margin-top: 20px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
        }
        .help-text {
            margin-top: 20px;
            font-size: 14px;
            color: #888;
        }
        .help-text a {
            color: #667eea;
        }
    </style>
</head>
<body>
    <div class="success-card">
        <div class="checkmark">✓</div>

        <h1>Welcome to DataAcuity!</h1>
        <p class="subtitle">
            <?php if ($isFree): ?>
                Your free account is ready to use.
            <?php else: ?>
                Your subscription is now active.
            <?php endif; ?>
        </p>

        <div class="features">
            <h3>You now have access to:</h3>
            <ul>
                <?php if ($isFree): ?>
                    <li>One complete end-to-end workflow</li>
                    <li>20 workflow executions per month</li>
                    <li>50 AI conversations per month</li>
                    <li>Bio Pages (1 page)</li>
                    <li>File Converter (20 conversions)</li>
                <?php else: ?>
                    <li>CRM - Unlimited contacts & deals</li>
                    <li>Analytics - Unlimited dashboards</li>
                    <li>Workflows - Process automation</li>
                    <li>AI Assistant - Chat with AI models</li>
                    <li>Data Sync - Connect your data sources</li>
                    <li>File Converter - 1000+ formats</li>
                    <li>Bio Pages - Digital business cards</li>
                    <li>Markets - Financial data</li>
                <?php endif; ?>
            </ul>
        </div>

        <a href="/" class="cta-button">Go to Dashboard</a>

        <p class="help-text">
            Need help getting started? <a href="mailto:support@dataacuity.co.za">Contact support</a>
        </p>
    </div>

    <script>
        // Refresh auth state after payment
        setTimeout(() => {
            if (window.opener) {
                window.opener.location.reload();
            }
        }, 1000);
    </script>
</body>
</html>
