<?php
/**
 * DataAcuity - PayFast Configuration
 *
 * PayFast Sandbox credentials for testing
 * Replace with production credentials before go-live
 */

return [
    // Environment: 'sandbox' or 'production'
    'environment' => 'production',

    // Sandbox credentials (for testing)
    'sandbox' => [
        'merchant_id' => '10000100',
        'merchant_key' => '46f0cd694581a',
        'passphrase' => 'jt7NOE43FZPn', // Sandbox passphrase
        'url' => 'https://sandbox.payfast.co.za/eng/process'
    ],

    // Production credentials
    'production' => [
        'merchant_id' => '10056894',
        'merchant_key' => 'llolnk8x1a3kk',
        'passphrase' => 'Bh3nguNgc0l0siMsh1b3',
        'url' => 'https://www.payfast.co.za/eng/process'
    ],

    // Site URLs
    'site_url' => 'https://dataacuity.co.za',
    'return_url' => 'https://dataacuity.co.za/billing/success.php',
    'cancel_url' => 'https://dataacuity.co.za/billing/cancel.php',
    'notify_url' => 'https://dataacuity.co.za/billing/webhooks/notify.php',

    // Subscription Plans
    'plans' => [
        'free' => [
            'name' => 'Free Tier',
            'amount' => 0,
            'description' => 'One end-to-end process',
            'billing_cycle' => null,
            'users' => 1,
            'limits' => [
                'workflow_runs' => 20,
                'ai_conversations' => 50,
                'file_conversions' => 20,
                'bio_pages' => 1,
                'dashboards' => 3,
                'data_connections' => 1
            ]
        ],
        'starter' => [
            'name' => 'Starter',
            'amount' => 499.00,
            'description' => 'Full platform access for 1 user',
            'billing_cycle' => 'Monthly',
            'users' => 1,
            'limits' => [
                'workflow_runs' => 5000,
                'ai_conversations' => 500,
                'file_conversions' => 500,
                'bio_pages' => 10,
                'dashboards' => -1, // unlimited
                'data_connections' => 3
            ]
        ],
        'growth' => [
            'name' => 'Growth',
            'base_amount' => 499.00,
            'per_user_amount' => 99.00,
            'description' => 'Full platform for teams up to 10',
            'billing_cycle' => 'Monthly',
            'max_users' => 10,
            'limits' => [
                'workflow_runs' => 25000,
                'ai_conversations' => 2500,
                'file_conversions' => -1, // unlimited
                'bio_pages' => -1, // unlimited
                'dashboards' => -1, // unlimited
                'data_connections' => 10
            ]
        ]
    ],

    // PayFast valid hosts for ITN verification
    'valid_hosts' => [
        'www.payfast.co.za',
        'sandbox.payfast.co.za',
        'w1w.payfast.co.za',
        'w2w.payfast.co.za'
    ]
];
