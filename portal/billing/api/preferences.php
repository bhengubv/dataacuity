<?php
/**
 * User Preferences API
 * Stores user preferences (language, theme, etc.) per user account
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: https://dataacuity.co.za');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Preferences storage directory
$prefsDir = __DIR__ . '/../data/preferences';
if (!is_dir($prefsDir)) {
    mkdir($prefsDir, 0755, true);
}

// Get user identifier from request
$userId = $_GET['user_id'] ?? $_POST['user_id'] ?? null;
$email = $_GET['email'] ?? $_POST['email'] ?? null;

// Use email hash as filename for privacy
$userKey = $userId ?? $email;
if (!$userKey) {
    http_response_code(400);
    echo json_encode(['error' => 'user_id or email required']);
    exit;
}

$prefsFile = $prefsDir . '/' . md5(strtolower(trim($userKey))) . '.json';

// Default preferences
$defaults = [
    'language' => 'en',
    'theme' => 'light',
    'notifications' => true,
    'compactMode' => false
];

/**
 * Load user preferences
 */
function loadPreferences($file, $defaults) {
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        return array_merge($defaults, $data ?? []);
    }
    return $defaults;
}

/**
 * Save user preferences
 */
function savePreferences($file, $prefs) {
    $prefs['updated_at'] = date('c');
    return file_put_contents($file, json_encode($prefs, JSON_PRETTY_PRINT));
}

// Handle request
$action = $_GET['action'] ?? $_POST['action'] ?? 'get';

switch ($action) {
    case 'get':
        // Return all preferences
        $prefs = loadPreferences($prefsFile, $defaults);
        echo json_encode([
            'success' => true,
            'preferences' => $prefs
        ]);
        break;

    case 'set':
        // Update specific preference(s)
        $prefs = loadPreferences($prefsFile, $defaults);

        // Get input from POST body or query params
        $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

        // Update allowed preferences
        $allowedKeys = ['language', 'theme', 'notifications', 'compactMode'];
        foreach ($allowedKeys as $key) {
            if (isset($input[$key])) {
                $prefs[$key] = $input[$key];
            }
        }

        if (savePreferences($prefsFile, $prefs)) {
            echo json_encode([
                'success' => true,
                'preferences' => $prefs
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save preferences']);
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action. Use: get, set']);
}
