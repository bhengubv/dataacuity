<?php
/**
 * DataAcuity - PayFast ITN (Instant Transaction Notification) Handler
 *
 * This webhook receives payment notifications from PayFast
 */

header('Content-Type: text/plain');

// Log all ITN requests
$logFile = __DIR__ . '/../logs/itn_' . date('Y-m-d') . '.log';
$logDir = dirname($logFile);
if (!is_dir($logDir)) {
    mkdir($logDir, 0755, true);
}

function logITN($message) {
    global $logFile;
    $timestamp = date('Y-m-d H:i:s');
    file_put_contents($logFile, "[$timestamp] $message\n", FILE_APPEND);
}

require_once __DIR__ . '/../api/payfast-common.php';
require_once __DIR__ . '/../api/subscriptions.php';

try {
    // Get posted data
    $pfData = $_POST;

    logITN("ITN received: " . json_encode($pfData));

    if (empty($pfData)) {
        logITN("ERROR: Empty POST data");
        die('NO_DATA');
    }

    // Strip signature for validation
    $pfParamString = '';
    foreach ($pfData as $key => $val) {
        if ($key !== 'signature') {
            $pfParamString .= $key . '=' . urlencode($val) . '&';
        }
    }
    $pfParamString = substr($pfParamString, 0, -1);

    // Validate ITN
    $payfast = new PayFast();

    if (!$payfast->validateITN($pfData, $pfParamString)) {
        logITN("ERROR: ITN validation failed");
        die('INVALID_SIGNATURE');
    }

    // Verify with PayFast server
    if (!$payfast->verifyPayment($pfParamString)) {
        logITN("ERROR: Payment verification failed");
        die('VERIFICATION_FAILED');
    }

    // Process based on payment status
    $subscriptions = new Subscriptions();
    $paymentStatus = $pfData['payment_status'] ?? '';
    $email = $pfData['email_address'] ?? '';
    $planId = $pfData['custom_str1'] ?? 'starter';
    $userCount = intval($pfData['custom_str2'] ?? 1);
    $paymentId = $pfData['m_payment_id'] ?? '';
    $pfPaymentId = $pfData['pf_payment_id'] ?? '';
    $amount = floatval($pfData['amount_gross'] ?? 0);

    logITN("Processing: status=$paymentStatus, email=$email, plan=$planId");

    switch ($paymentStatus) {
        case 'COMPLETE':
            // Payment successful - activate/renew subscription
            $result = $subscriptions->activateSubscription([
                'email' => $email,
                'plan_id' => $planId,
                'user_count' => $userCount,
                'payment_id' => $paymentId,
                'pf_payment_id' => $pfPaymentId,
                'amount' => $amount,
                'status' => 'active',
                'expires_at' => date('Y-m-d H:i:s', strtotime('+1 month'))
            ]);
            logITN("Subscription activated: " . json_encode($result));
            break;

        case 'CANCELLED':
            // Subscription cancelled
            $subscriptions->cancelSubscription($email);
            logITN("Subscription cancelled for: $email");
            break;

        case 'FAILED':
            // Payment failed
            logITN("Payment failed for: $email");
            break;

        default:
            logITN("Unknown status: $paymentStatus");
    }

    echo 'OK';

} catch (Exception $e) {
    logITN("EXCEPTION: " . $e->getMessage());
    http_response_code(500);
    echo 'ERROR';
}
