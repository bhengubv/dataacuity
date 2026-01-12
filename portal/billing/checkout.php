<?php
/**
 * DataAcuity - Checkout Page
 *
 * Generates PayFast payment form and redirects to PayFast
 */

require_once __DIR__ . '/api/payfast-common.php';

// Get parameters
$planId = $_GET['plan'] ?? $_POST['plan'] ?? 'starter';
$email = $_GET['email'] ?? $_POST['email'] ?? '';
$name = $_GET['name'] ?? $_POST['name'] ?? '';
$userCount = intval($_GET['users'] ?? $_POST['users'] ?? 1);

// Validate
if (empty($email)) {
    header('Location: /?error=email_required');
    exit;
}

// Handle free tier - no payment needed
if ($planId === 'free') {
    require_once __DIR__ . '/api/subscriptions.php';
    $subscriptions = new Subscriptions();
    $subscriptions->activateSubscription([
        'email' => $email,
        'plan_id' => 'free',
        'user_count' => 1,
        'payment_id' => 'FREE_' . uniqid(),
        'pf_payment_id' => '',
        'amount' => 0,
        'status' => 'active',
        'expires_at' => null // Free never expires
    ]);
    header('Location: /billing/success.php?plan=free');
    exit;
}

// Generate PayFast form
try {
    $payfast = new PayFast();
    $formData = $payfast->generateFormData($planId, $email, $name, $userCount);
} catch (Exception $e) {
    header('Location: /?error=' . urlencode($e->getMessage()));
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Checkout - DataAcuity</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .checkout-card {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
        }
        .logo { font-size: 48px; margin-bottom: 20px; }
        h1 { font-size: 24px; margin-bottom: 10px; color: #1a1a2e; }
        .plan-name { color: #667eea; font-weight: 600; }
        .price {
            font-size: 36px;
            font-weight: 700;
            color: #1a1a2e;
            margin: 20px 0;
        }
        .price span { font-size: 16px; color: #666; }
        .details {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            text-align: left;
        }
        .details p {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            color: #444;
        }
        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .redirect-text { color: #666; font-size: 14px; }
        .secure {
            margin-top: 20px;
            font-size: 12px;
            color: #888;
        }
        .secure img { height: 30px; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="checkout-card">
        <div class="logo">📊</div>
        <h1>DataAcuity <span class="plan-name"><?php echo htmlspecialchars($formData['data']['item_name']); ?></span></h1>

        <div class="price">
            R<?php echo number_format(floatval($formData['data']['amount']), 0); ?>
            <span>/month</span>
        </div>

        <div class="details">
            <p><span>Email:</span> <strong><?php echo htmlspecialchars($email); ?></strong></p>
            <?php if ($userCount > 1): ?>
            <p><span>Users:</span> <strong><?php echo $userCount; ?></strong></p>
            <?php endif; ?>
            <p><span>Billing:</span> <strong>Monthly</strong></p>
        </div>

        <div class="spinner"></div>
        <p class="redirect-text">Redirecting to PayFast...</p>

        <div class="secure">
            🔒 Secure payment powered by PayFast
        </div>

        <!-- Hidden PayFast Form -->
        <form id="payfast-form" action="<?php echo $formData['url']; ?>" method="POST" style="display: none;">
            <?php foreach ($formData['data'] as $key => $value): ?>
            <input type="hidden" name="<?php echo htmlspecialchars($key); ?>" value="<?php echo htmlspecialchars($value); ?>">
            <?php endforeach; ?>
        </form>
    </div>

    <script>
        // Auto-submit form after short delay
        setTimeout(function() {
            document.getElementById('payfast-form').submit();
        }, 2000);
    </script>
</body>
</html>
