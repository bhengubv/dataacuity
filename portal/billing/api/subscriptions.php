<?php
/**
 * DataAcuity - Subscription Management
 *
 * Uses SQLite for simple subscription storage
 */

class Subscriptions {
    private $db;
    private $dbPath;

    public function __construct() {
        $this->dbPath = __DIR__ . '/../data/subscriptions.db';
        $dataDir = dirname($this->dbPath);

        if (!is_dir($dataDir)) {
            mkdir($dataDir, 0755, true);
        }

        $this->db = new SQLite3($this->dbPath);
        $this->initDatabase();
    }

    private function initDatabase() {
        // Create subscriptions table
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                plan_id TEXT NOT NULL DEFAULT 'free',
                user_count INTEGER DEFAULT 1,
                status TEXT DEFAULT 'active',
                payment_id TEXT,
                pf_payment_id TEXT,
                amount REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                cancelled_at DATETIME
            )
        ");

        // Create usage table
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                metric TEXT NOT NULL,
                count INTEGER DEFAULT 0,
                period TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(email, metric, period)
            )
        ");

        // Create payments log
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                payment_id TEXT,
                pf_payment_id TEXT,
                amount REAL,
                status TEXT,
                plan_id TEXT,
                raw_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ");
    }

    /**
     * Get subscription by email
     */
    public function getSubscription($email) {
        $stmt = $this->db->prepare("SELECT * FROM subscriptions WHERE email = :email");
        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        $result = $stmt->execute();
        $row = $result->fetchArray(SQLITE3_ASSOC);

        if (!$row) {
            // Return free tier by default
            return [
                'email' => $email,
                'plan_id' => 'free',
                'user_count' => 1,
                'status' => 'active',
                'is_free' => true
            ];
        }

        // Check if expired
        if ($row['expires_at'] && strtotime($row['expires_at']) < time()) {
            $row['status'] = 'expired';
        }

        return $row;
    }

    /**
     * Activate or update subscription
     */
    public function activateSubscription($data) {
        $email = $data['email'];
        $existing = $this->getSubscription($email);

        if ($existing && !isset($existing['is_free'])) {
            // Update existing
            $stmt = $this->db->prepare("
                UPDATE subscriptions SET
                    plan_id = :plan_id,
                    user_count = :user_count,
                    status = :status,
                    payment_id = :payment_id,
                    pf_payment_id = :pf_payment_id,
                    amount = :amount,
                    expires_at = :expires_at,
                    updated_at = CURRENT_TIMESTAMP,
                    cancelled_at = NULL
                WHERE email = :email
            ");
        } else {
            // Insert new
            $stmt = $this->db->prepare("
                INSERT INTO subscriptions (email, plan_id, user_count, status, payment_id, pf_payment_id, amount, expires_at)
                VALUES (:email, :plan_id, :user_count, :status, :payment_id, :pf_payment_id, :amount, :expires_at)
            ");
        }

        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        $stmt->bindValue(':plan_id', $data['plan_id'], SQLITE3_TEXT);
        $stmt->bindValue(':user_count', $data['user_count'], SQLITE3_INTEGER);
        $stmt->bindValue(':status', $data['status'], SQLITE3_TEXT);
        $stmt->bindValue(':payment_id', $data['payment_id'], SQLITE3_TEXT);
        $stmt->bindValue(':pf_payment_id', $data['pf_payment_id'], SQLITE3_TEXT);
        $stmt->bindValue(':amount', $data['amount'], SQLITE3_FLOAT);
        $stmt->bindValue(':expires_at', $data['expires_at'], SQLITE3_TEXT);

        $result = $stmt->execute();

        // Log payment
        $this->logPayment($data);

        return $this->getSubscription($email);
    }

    /**
     * Cancel subscription
     */
    public function cancelSubscription($email) {
        $stmt = $this->db->prepare("
            UPDATE subscriptions SET
                status = 'cancelled',
                cancelled_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE email = :email
        ");
        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        return $stmt->execute();
    }

    /**
     * Log payment
     */
    public function logPayment($data) {
        $stmt = $this->db->prepare("
            INSERT INTO payments (email, payment_id, pf_payment_id, amount, status, plan_id, raw_data)
            VALUES (:email, :payment_id, :pf_payment_id, :amount, :status, :plan_id, :raw_data)
        ");
        $stmt->bindValue(':email', $data['email'], SQLITE3_TEXT);
        $stmt->bindValue(':payment_id', $data['payment_id'] ?? '', SQLITE3_TEXT);
        $stmt->bindValue(':pf_payment_id', $data['pf_payment_id'] ?? '', SQLITE3_TEXT);
        $stmt->bindValue(':amount', $data['amount'] ?? 0, SQLITE3_FLOAT);
        $stmt->bindValue(':status', $data['status'] ?? '', SQLITE3_TEXT);
        $stmt->bindValue(':plan_id', $data['plan_id'] ?? '', SQLITE3_TEXT);
        $stmt->bindValue(':raw_data', json_encode($data), SQLITE3_TEXT);
        return $stmt->execute();
    }

    /**
     * Track usage
     */
    public function trackUsage($email, $metric, $increment = 1) {
        $period = date('Y-m'); // Monthly periods

        // Try to update existing
        $stmt = $this->db->prepare("
            INSERT INTO usage (email, metric, count, period)
            VALUES (:email, :metric, :increment, :period)
            ON CONFLICT(email, metric, period) DO UPDATE SET count = count + :increment
        ");
        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        $stmt->bindValue(':metric', $metric, SQLITE3_TEXT);
        $stmt->bindValue(':increment', $increment, SQLITE3_INTEGER);
        $stmt->bindValue(':period', $period, SQLITE3_TEXT);
        return $stmt->execute();
    }

    /**
     * Get current usage
     */
    public function getUsage($email, $metric = null) {
        $period = date('Y-m');

        if ($metric) {
            $stmt = $this->db->prepare("
                SELECT * FROM usage WHERE email = :email AND metric = :metric AND period = :period
            ");
            $stmt->bindValue(':metric', $metric, SQLITE3_TEXT);
        } else {
            $stmt = $this->db->prepare("
                SELECT * FROM usage WHERE email = :email AND period = :period
            ");
        }
        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        $stmt->bindValue(':period', $period, SQLITE3_TEXT);

        $result = $stmt->execute();
        $usage = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $usage[$row['metric']] = $row['count'];
        }
        return $usage;
    }

    /**
     * Check if user is within limits
     */
    public function checkLimit($email, $metric) {
        $config = require __DIR__ . '/../config/payfast.php';
        $subscription = $this->getSubscription($email);
        $usage = $this->getUsage($email, $metric);

        $planId = $subscription['plan_id'];
        $plan = $config['plans'][$planId] ?? $config['plans']['free'];
        $limit = $plan['limits'][$metric] ?? 0;

        // -1 means unlimited
        if ($limit === -1) {
            return ['allowed' => true, 'remaining' => -1];
        }

        $used = $usage[$metric] ?? 0;
        $remaining = max(0, $limit - $used);

        return [
            'allowed' => $remaining > 0,
            'limit' => $limit,
            'used' => $used,
            'remaining' => $remaining
        ];
    }

    /**
     * Get plan limits for user
     */
    public function getPlanLimits($email) {
        $config = require __DIR__ . '/../config/payfast.php';
        $subscription = $this->getSubscription($email);
        $planId = $subscription['plan_id'];
        $plan = $config['plans'][$planId] ?? $config['plans']['free'];

        return [
            'plan' => $plan,
            'subscription' => $subscription,
            'usage' => $this->getUsage($email)
        ];
    }
}

// API endpoint handling
if (php_sapi_name() !== 'cli' && basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        exit(0);
    }

    $subscriptions = new Subscriptions();
    $action = $_GET['action'] ?? 'status';
    $email = $_GET['email'] ?? $_POST['email'] ?? '';

    if (empty($email)) {
        http_response_code(400);
        echo json_encode(['error' => 'Email required']);
        exit;
    }

    try {
        switch ($action) {
            case 'status':
                $result = $subscriptions->getPlanLimits($email);
                break;

            case 'usage':
                $metric = $_GET['metric'] ?? null;
                $result = $subscriptions->getUsage($email, $metric);
                break;

            case 'check':
                $metric = $_GET['metric'] ?? '';
                $result = $subscriptions->checkLimit($email, $metric);
                break;

            case 'track':
                $metric = $_POST['metric'] ?? '';
                $increment = intval($_POST['increment'] ?? 1);
                $subscriptions->trackUsage($email, $metric, $increment);
                $result = ['success' => true];
                break;

            default:
                $result = ['error' => 'Unknown action'];
        }

        echo json_encode($result);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}
