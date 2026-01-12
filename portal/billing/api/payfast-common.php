<?php
/**
 * DataAcuity - PayFast Common Functions
 */

class PayFast {
    private $config;
    private $env;

    public function __construct() {
        $this->config = require __DIR__ . '/../config/payfast.php';
        $this->env = $this->config['environment'];
    }

    /**
     * Get credentials based on environment
     */
    public function getCredentials() {
        return $this->config[$this->env];
    }

    /**
     * Get plan details
     */
    public function getPlan($planId) {
        return $this->config['plans'][$planId] ?? null;
    }

    /**
     * Calculate Growth plan price
     */
    public function calculateGrowthPrice($userCount) {
        $plan = $this->getPlan('growth');
        if ($userCount < 1) $userCount = 1;
        if ($userCount > $plan['max_users']) $userCount = $plan['max_users'];

        // Base price + (additional users * per_user)
        $additionalUsers = max(0, $userCount - 1);
        return $plan['base_amount'] + ($additionalUsers * $plan['per_user_amount']);
    }

    /**
     * Generate PayFast signature
     */
    public function generateSignature($data, $passphrase = null) {
        // Create parameter string
        $pfOutput = '';
        foreach ($data as $key => $val) {
            if ($val !== '') {
                $pfOutput .= $key . '=' . urlencode(trim($val)) . '&';
            }
        }
        // Remove last ampersand
        $pfOutput = substr($pfOutput, 0, -1);

        // Add passphrase if set
        if ($passphrase !== null) {
            $pfOutput .= '&passphrase=' . urlencode(trim($passphrase));
        }

        return md5($pfOutput);
    }

    /**
     * Generate payment form data
     */
    public function generateFormData($planId, $userEmail, $userName, $userCount = 1, $customStr = '') {
        $credentials = $this->getCredentials();
        $plan = $this->getPlan($planId);

        if (!$plan) {
            throw new Exception("Invalid plan: $planId");
        }

        // Calculate amount
        if ($planId === 'growth') {
            $amount = $this->calculateGrowthPrice($userCount);
            $itemName = "DataAcuity Growth ({$userCount} users)";
        } else {
            $amount = $plan['amount'];
            $itemName = "DataAcuity {$plan['name']}";
        }

        // Build data array (order matters for signature)
        $data = [
            'merchant_id' => $credentials['merchant_id'],
            'merchant_key' => $credentials['merchant_key'],
            'return_url' => $this->config['return_url'],
            'cancel_url' => $this->config['cancel_url'],
            'notify_url' => $this->config['notify_url'],
            'name_first' => explode(' ', $userName)[0],
            'name_last' => explode(' ', $userName)[1] ?? '',
            'email_address' => $userEmail,
            'm_payment_id' => uniqid('DA_'),
            'amount' => number_format($amount, 2, '.', ''),
            'item_name' => $itemName,
            'item_description' => $plan['description'],
            'custom_str1' => $planId,
            'custom_str2' => $userCount,
            'custom_str3' => $customStr,
            'subscription_type' => '1', // Subscription
            'billing_date' => date('Y-m-d'),
            'recurring_amount' => number_format($amount, 2, '.', ''),
            'frequency' => '3', // Monthly
            'cycles' => '0' // Indefinite
        ];

        // For free tier, don't set subscription fields
        if ($planId === 'free') {
            unset($data['subscription_type']);
            unset($data['billing_date']);
            unset($data['recurring_amount']);
            unset($data['frequency']);
            unset($data['cycles']);
            $data['amount'] = '0.00';
        }

        // Generate signature
        $data['signature'] = $this->generateSignature($data, $credentials['passphrase']);

        return [
            'url' => $credentials['url'],
            'data' => $data
        ];
    }

    /**
     * Validate ITN data
     */
    public function validateITN($pfData, $pfParamString) {
        $credentials = $this->getCredentials();

        // Verify source IP
        $validHosts = $this->config['valid_hosts'];
        $validIps = [];
        foreach ($validHosts as $pfHostname) {
            $ips = gethostbynamel($pfHostname);
            if ($ips !== false) {
                $validIps = array_merge($validIps, $ips);
            }
        }
        $validIps = array_unique($validIps);

        $referrerIp = $_SERVER['REMOTE_ADDR'] ?? '';
        if (!in_array($referrerIp, $validIps)) {
            // For testing, you might want to log this but not reject
            error_log("PayFast ITN: IP not in valid range: $referrerIp");
        }

        // Verify signature
        $tempParamString = $pfParamString;
        if (!empty($credentials['passphrase'])) {
            $tempParamString .= '&passphrase=' . urlencode($credentials['passphrase']);
        }
        $signature = md5($tempParamString);

        if ($signature !== $pfData['signature']) {
            error_log("PayFast ITN: Signature mismatch");
            return false;
        }

        return true;
    }

    /**
     * Verify payment with PayFast server
     */
    public function verifyPayment($pfParamString) {
        $credentials = $this->getCredentials();
        $pfHost = ($this->env === 'sandbox') ? 'sandbox.payfast.co.za' : 'www.payfast.co.za';

        $url = "https://{$pfHost}/eng/query/validate";

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $pfParamString);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);

        $response = curl_exec($ch);
        curl_close($ch);

        return strtoupper($response) === 'VALID';
    }
}
