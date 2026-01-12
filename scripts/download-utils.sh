#!/bin/bash
# =============================================================================
# Download Utilities for Maps Data
# Rate-limited, batched downloads with retry logic
# =============================================================================

# Default settings
DEFAULT_RATE_LIMIT="500k"
DEFAULT_RETRY_WAIT="30"
DEFAULT_MAX_RETRIES="5"
DEFAULT_USER_AGENT="DataAcuity Maps Service (maps@dataacuity.co.za)"

# Download a file with rate limiting and retry logic
# Usage: rate_limited_download URL OUTPUT_PATH [RATE_LIMIT]
rate_limited_download() {
    local url="$1"
    local output="$2"
    local rate_limit="${3:-$DEFAULT_RATE_LIMIT}"

    echo "Downloading: $url"
    echo "Output: $output"
    echo "Rate limit: $rate_limit/s"
    echo ""

    wget \
        --limit-rate="$rate_limit" \
        --tries="$DEFAULT_MAX_RETRIES" \
        --waitretry="$DEFAULT_RETRY_WAIT" \
        --retry-connrefused \
        --continue \
        --progress=dot:giga \
        --user-agent="$DEFAULT_USER_AGENT" \
        --output-document="$output" \
        "$url"
}

# Download multiple files in sequence with delays between them
# Usage: batch_download FILE_LIST_PATH OUTPUT_DIR [DELAY_SECONDS]
batch_download() {
    local file_list="$1"
    local output_dir="$2"
    local delay="${3:-60}"  # Default 60 second delay between files

    mkdir -p "$output_dir"

    local count=0
    local total=$(wc -l < "$file_list")

    while IFS= read -r url; do
        count=$((count + 1))
        local filename=$(basename "$url")

        echo "=============================================="
        echo "Downloading file $count of $total: $filename"
        echo "=============================================="

        rate_limited_download "$url" "$output_dir/$filename"

        if [ $count -lt $total ]; then
            echo ""
            echo "Waiting ${delay}s before next download..."
            sleep "$delay"
        fi
    done < "$file_list"

    echo ""
    echo "=============================================="
    echo "Batch download complete: $count files"
    echo "=============================================="
}

# Download with threading (parallel downloads with rate limiting per thread)
# Usage: parallel_download FILE_LIST_PATH OUTPUT_DIR [MAX_PARALLEL] [RATE_PER_THREAD]
parallel_download() {
    local file_list="$1"
    local output_dir="$2"
    local max_parallel="${3:-2}"  # Default 2 parallel downloads
    local rate_per_thread="${4:-250k}"  # Split rate among threads

    mkdir -p "$output_dir"

    echo "=============================================="
    echo "Parallel download: max $max_parallel threads"
    echo "Rate per thread: $rate_per_thread/s"
    echo "=============================================="

    # Use xargs for parallel downloads with rate limiting
    cat "$file_list" | xargs -P "$max_parallel" -I {} bash -c "
        filename=\$(basename {})
        wget \
            --limit-rate='$rate_per_thread' \
            --tries='$DEFAULT_MAX_RETRIES' \
            --waitretry='$DEFAULT_RETRY_WAIT' \
            --retry-connrefused \
            --continue \
            --quiet \
            --show-progress \
            --user-agent='$DEFAULT_USER_AGENT' \
            --output-document='$output_dir/\$filename' \
            {}
        echo \"Downloaded: \$filename\"
    "

    echo ""
    echo "=============================================="
    echo "Parallel download complete"
    echo "=============================================="
}

# Check if we're being rate limited (HTTP 429)
check_rate_limit() {
    local url="$1"
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$url")

    if [ "$response" = "429" ]; then
        echo "RATE_LIMITED"
        return 1
    elif [ "$response" = "200" ]; then
        echo "OK"
        return 0
    else
        echo "ERROR_$response"
        return 2
    fi
}

# Exponential backoff retry
# Usage: with_backoff COMMAND [MAX_RETRIES]
with_backoff() {
    local cmd="$1"
    local max_retries="${2:-5}"
    local retry=0
    local wait_time=10

    while [ $retry -lt $max_retries ]; do
        if eval "$cmd"; then
            return 0
        fi

        retry=$((retry + 1))
        echo "Attempt $retry failed, waiting ${wait_time}s..."
        sleep $wait_time
        wait_time=$((wait_time * 2))  # Exponential backoff
    done

    echo "Max retries reached"
    return 1
}

# Export functions for use in other scripts
export -f rate_limited_download
export -f batch_download
export -f parallel_download
export -f check_rate_limit
export -f with_backoff
