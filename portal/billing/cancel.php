<?php
/**
 * DataAcuity - Payment Cancelled Page
 */
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Cancelled - DataAcuity</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .cancel-card {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 450px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
            text-align: center;
        }
        .icon {
            width: 80px;
            height: 80px;
            background: #f8d7da;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            font-size: 40px;
        }
        h1 {
            font-size: 24px;
            color: #1a1a2e;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            line-height: 1.6;
        }
        .options {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-top: 20px;
        }
        .btn {
            display: inline-block;
            padding: 15px 30px;
            border-radius: 30px;
            font-weight: 600;
            font-size: 14px;
            text-decoration: none;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
        }
        .btn-secondary {
            background: #f8f9fa;
            color: #444;
            border: 1px solid #ddd;
        }
        .btn-secondary:hover {
            background: #e9ecef;
        }
        .help-text {
            margin-top: 25px;
            font-size: 13px;
            color: #888;
        }
        .help-text a {
            color: #667eea;
        }
    </style>
</head>
<body>
    <div class="cancel-card">
        <div class="icon">↩️</div>

        <h1>Payment Cancelled</h1>
        <p class="subtitle">
            No worries! Your payment was cancelled and you haven't been charged.
            <br><br>
            You can try again when you're ready, or start with our free tier.
        </p>

        <div class="options">
            <a href="/#pricing" class="btn btn-primary">View Plans Again</a>
            <a href="/billing/checkout.php?plan=free&email=<?php echo urlencode($_GET['email'] ?? ''); ?>" class="btn btn-secondary">Start Free Instead</a>
            <a href="/" class="btn btn-secondary">Back to Home</a>
        </div>

        <p class="help-text">
            Having trouble? <a href="mailto:support@dataacuity.co.za">Contact support</a>
        </p>
    </div>
</body>
</html>
