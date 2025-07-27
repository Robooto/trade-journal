import logging
import time
from typing import Dict, Optional, Any, Tuple
from dataclasses import dataclass
from threading import Lock

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    data: Any
    timestamp: float
    ttl: int  # Time to live in seconds


class InMemoryCache:
    """
    Simple in-memory cache with TTL (Time To Live) support.
    Thread-safe implementation for caching API responses.
    """
    
    def __init__(self):
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = Lock()
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from cache if it exists and hasn't expired.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value if exists and valid, None otherwise
        """
        with self._lock:
            if key not in self._cache:
                return None
            
            entry = self._cache[key]
            current_time = time.time()
            
            # Check if entry has expired
            if current_time - entry.timestamp > entry.ttl:
                logger.debug(f"Cache entry expired for key: {key}")
                del self._cache[key]
                return None
            
            logger.debug(f"Cache hit for key: {key}")
            return entry.data
    
    def set(self, key: str, value: Any, ttl: int = 300) -> None:
        """
        Set a value in cache with TTL.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds (default: 5 minutes)
        """
        with self._lock:
            self._cache[key] = CacheEntry(
                data=value,
                timestamp=time.time(),
                ttl=ttl
            )
            logger.debug(f"Cache set for key: {key} with TTL: {ttl}s")
    
    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._cache.clear()
            logger.info("Cache cleared")
    
    def cleanup_expired(self) -> int:
        """
        Remove expired entries from cache.
        
        Returns:
            Number of entries removed
        """
        with self._lock:
            current_time = time.time()
            expired_keys = []
            
            for key, entry in self._cache.items():
                if current_time - entry.timestamp > entry.ttl:
                    expired_keys.append(key)
            
            for key in expired_keys:
                del self._cache[key]
            
            if expired_keys:
                logger.info(f"Cleaned up {len(expired_keys)} expired cache entries")
            
            return len(expired_keys)
    
    def size(self) -> int:
        """Get current cache size."""
        with self._lock:
            return len(self._cache)


# Global cache instance
_cache_instance: Optional[InMemoryCache] = None


def get_cache() -> InMemoryCache:
    """Get the global cache instance (singleton pattern)."""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = InMemoryCache()
    return _cache_instance


def create_cache_key(symbol: str, resolution: str, from_ts: int, to_ts: int) -> str:
    """
    Create a cache key for chart data.
    
    Args:
        symbol: Stock symbol
        resolution: Chart resolution
        from_ts: Start timestamp
        to_ts: End timestamp
        
    Returns:
        Cache key string
    """
    return f"chart:{symbol}:{resolution}:{from_ts}:{to_ts}"