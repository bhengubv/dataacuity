/**
 * Data Acuity SDK for React Native
 *
 * Provides easy access to all Data Acuity APIs with built-in
 * authentication, caching, and error handling.
 *
 * Usage:
 *   import { useMarkets, useMaps, useAuth } from '@dataacuity/sdk';
 *
 * API Documentation:
 *   https://api.dataacuity.co.za/integration.json
 */

import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

// =============================================================================
// Configuration
// =============================================================================

const API_BASE = 'https://api.dataacuity.co.za/api/v1';

let globalConfig = {
  apiKey: null,
  appId: null,
  appSecret: null,
};

/**
 * Configure the SDK with your credentials
 */
export function configure(options) {
  globalConfig = { ...globalConfig, ...options };
}

// =============================================================================
// Core API Client
// =============================================================================

async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers,
  };

  // Add authentication headers
  if (globalConfig.apiKey) {
    headers['X-API-Key'] = globalConfig.apiKey;
  }
  if (globalConfig.appId) {
    headers['X-App-ID'] = globalConfig.appId;
  }
  if (globalConfig.appSecret) {
    headers['X-App-Secret'] = globalConfig.appSecret;
  }

  // Get stored auth token if available
  try {
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (e) {
    // SecureStore not available (web)
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(response.status, error.detail || 'API request failed');
  }

  return response.json();
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// =============================================================================
// Markets API
// =============================================================================

/**
 * Hook for accessing market data
 *
 * @example
 * const { prices, loading, error, refresh } = useMarkets();
 */
export function useMarkets() {
  const [prices, setPrices] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [sentiment, setSentiment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPrices = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/markets/prices');
      setPrices(data.prices || data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPredictions = useCallback(async () => {
    try {
      const data = await apiRequest('/markets/predictions');
      setPredictions(data.predictions || data);
    } catch (e) {
      console.warn('Failed to fetch predictions:', e.message);
    }
  }, []);

  const fetchSentiment = useCallback(async () => {
    try {
      const data = await apiRequest('/markets/sentiment');
      setSentiment(data);
    } catch (e) {
      console.warn('Failed to fetch sentiment:', e.message);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  return {
    prices,
    predictions,
    sentiment,
    loading,
    error,
    refresh: fetchPrices,
    fetchPredictions,
    fetchSentiment,
  };
}

/**
 * Get price for a specific symbol
 */
export async function getPrice(symbol) {
  return apiRequest(`/markets/prices/${symbol}`);
}

// =============================================================================
// Maps API
// =============================================================================

/**
 * Hook for accessing historical maps and places
 *
 * @example
 * const { places, loading, searchPlaces } = useMaps();
 */
export function useMaps() {
  const [places, setPlaces] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPlaces = useCallback(async (query = '') => {
    try {
      setLoading(true);
      const endpoint = query ? `/maps/places?q=${encodeURIComponent(query)}` : '/maps/places';
      const data = await apiRequest(endpoint);
      setPlaces(data.places || data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEvents = useCallback(async (filters = {}) => {
    try {
      const params = new URLSearchParams(filters).toString();
      const endpoint = params ? `/maps/events?${params}` : '/maps/events';
      const data = await apiRequest(endpoint);
      setEvents(data.events || data);
    } catch (e) {
      console.warn('Failed to fetch events:', e.message);
    }
  }, []);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  return {
    places,
    events,
    loading,
    error,
    searchPlaces: fetchPlaces,
    fetchEvents,
  };
}

/**
 * Get details for a specific place
 */
export async function getPlace(id) {
  return apiRequest(`/maps/places/${id}`);
}

// =============================================================================
// Analytics API (Superset)
// =============================================================================

/**
 * Hook for accessing Superset dashboards and charts
 * Requires authentication
 */
export function useAnalytics() {
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboards = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/analytics/dashboards');
      setDashboards(data.dashboards || data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const getChartData = useCallback(async (chartId) => {
    return apiRequest(`/analytics/charts/${chartId}/data`);
  }, []);

  useEffect(() => {
    fetchDashboards();
  }, [fetchDashboards]);

  return {
    dashboards,
    loading,
    error,
    refresh: fetchDashboards,
    getChartData,
  };
}

// =============================================================================
// Authentication
// =============================================================================

/**
 * Hook for user authentication via Keycloak
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        // Validate token with API
        const userData = await apiRequest('/auth/me');
        setUser(userData);
        setAuthenticated(true);
      }
    } catch (e) {
      setAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials) => {
    // In real implementation, this would redirect to Keycloak
    // For now, support basic API key auth
    if (credentials.apiKey) {
      globalConfig.apiKey = credentials.apiKey;
      await SecureStore.setItemAsync('api_key', credentials.apiKey);
      await checkAuth();
    }
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('api_key');
    globalConfig.apiKey = null;
    setUser(null);
    setAuthenticated(false);
  };

  return {
    user,
    loading,
    authenticated,
    login,
    logout,
    checkAuth,
  };
}

// =============================================================================
// Location Tracking (TagMe)
// =============================================================================

/**
 * Hook for location tracking via TagMe API
 * Requires authentication
 */
export function useLocation() {
  const [tracking, setTracking] = useState(false);
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState(null);

  const submitLocation = useCallback(async (coords) => {
    try {
      await apiRequest('/tagme/locations', {
        method: 'POST',
        body: JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const fetchHistory = useCallback(async (limit = 100) => {
    try {
      const data = await apiRequest(`/tagme/locations?limit=${limit}`);
      setLocations(data.locations || data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  return {
    tracking,
    locations,
    error,
    setTracking,
    submitLocation,
    fetchHistory,
  };
}

// =============================================================================
// File Conversion (Morph)
// =============================================================================

/**
 * Convert files using Morph API
 * Requires authentication
 */
export async function convertFile(file, targetFormat) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', targetFormat);

  const response = await fetch(`${API_BASE}/convert/convert`, {
    method: 'POST',
    headers: {
      'X-API-Key': globalConfig.apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new ApiError(response.status, 'Conversion failed');
  }

  return response.json();
}

/**
 * Get supported conversion formats
 */
export async function getFormats() {
  return apiRequest('/convert/formats');
}

// =============================================================================
// AI Chat
// =============================================================================

/**
 * Hook for AI chat functionality
 * Requires authentication
 */
export function useAI() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(async (content) => {
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content }]);

    try {
      const response = await apiRequest('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content }],
        }),
      });

      setMessages(prev => [...prev, { role: 'assistant', content: response.content }]);
      return response;
    } catch (e) {
      setMessages(prev => [...prev, { role: 'error', content: e.message }]);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [messages]);

  const clearChat = () => setMessages([]);

  return {
    messages,
    loading,
    sendMessage,
    clearChat,
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  configure,
  // Markets
  useMarkets,
  getPrice,
  // Maps
  useMaps,
  getPlace,
  // Analytics
  useAnalytics,
  // Auth
  useAuth,
  // Location
  useLocation,
  // Files
  convertFile,
  getFormats,
  // AI
  useAI,
  // Errors
  ApiError,
};
