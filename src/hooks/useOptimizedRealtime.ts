
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RealtimeConfig {
  table: string;
  events: ('INSERT' | 'UPDATE' | 'DELETE')[];
  filter?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  debounceMs?: number;
}

export function useOptimizedRealtime(configs: RealtimeConfig[]) {
  const { toast } = useToast();
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const channelRef = useRef<any>(null);
  const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const retryCountRef = useRef(0);
  const maxRetries = 5;

  const cleanup = () => {
    // 清理所有防抖定時器
    debounceTimersRef.current.forEach(timer => clearTimeout(timer));
    debounceTimersRef.current.clear();
    
    // 關閉現有連接
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch (error) {
        console.warn('Error removing channel:', error);
      }
      channelRef.current = null;
    }
  };

  const createDebounceHandler = (handler: (payload: any) => void, key: string, debounceMs: number = 300) => {
    return (payload: any) => {
      // 清理現有定時器
      const existingTimer = debounceTimersRef.current.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // 設置新的定時器
      const timer = setTimeout(() => {
        try {
          handler(payload);
          debounceTimersRef.current.delete(key);
        } catch (error) {
          console.error(`Error in debounced handler for ${key}:`, error);
        }
      }, debounceMs);

      debounceTimersRef.current.set(key, timer);
    };
  };

  const connect = () => {
    try {
      setConnectionStatus('connecting');
      
      // 創建新的頻道
      const channelName = `optimized_realtime_${Date.now()}`;
      const channel = supabase.channel(channelName);

      // 配置所有監聽器
      configs.forEach((config, index) => {
        const baseKey = `${config.table}_${index}`;
        
        config.events.forEach(event => {
          const handler = (() => {
            switch (event) {
              case 'INSERT': return config.onInsert;
              case 'UPDATE': return config.onUpdate;
              case 'DELETE': return config.onDelete;
              default: return undefined;
            }
          })();

          if (handler) {
            const debouncedHandler = config.debounceMs 
              ? createDebounceHandler(handler, `${baseKey}_${event}`, config.debounceMs)
              : handler;

            const listenConfig: any = {
              event,
              schema: 'public',
              table: config.table
            };

            if (config.filter) {
              listenConfig.filter = config.filter;
            }

            channel.on('postgres_changes', listenConfig, debouncedHandler);
          }
        });
      });

      // 訂閱並處理狀態
      channel.subscribe((status) => {
        switch (status) {
          case 'SUBSCRIBED':
            setConnectionStatus('connected');
            retryCountRef.current = 0;
            console.log('Realtime connection established');
            break;
          case 'CHANNEL_ERROR':
            setConnectionStatus('disconnected');
            console.error('Realtime connection error');
            handleConnectionError();
            break;
          case 'TIMED_OUT':
            setConnectionStatus('disconnected');
            console.error('Realtime connection timed out');
            handleConnectionError();
            break;
          case 'CLOSED':
            setConnectionStatus('disconnected');
            console.log('Realtime connection closed');
            break;
        }
      });

      channelRef.current = channel;
    } catch (error) {
      console.error('Error creating realtime connection:', error);
      setConnectionStatus('disconnected');
      handleConnectionError();
    }
  };

  const handleConnectionError = () => {
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 10000);
      
      console.log(`Retrying realtime connection in ${retryDelay}ms (attempt ${retryCountRef.current}/${maxRetries})`);
      
      setTimeout(() => {
        cleanup();
        connect();
      }, retryDelay);
    } else {
      toast({
        title: "連線問題",
        description: "即時更新連線異常，請重新整理頁面",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    if (configs.length === 0) return;

    connect();

    // 監聽瀏覽器連線狀態
    const handleOnline = () => {
      console.log('Browser came online, reconnecting realtime...');
      cleanup();
      connect();
    };

    const handleOffline = () => {
      console.log('Browser went offline');
      setConnectionStatus('disconnected');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 定期檢查連線狀態
    const healthCheckInterval = setInterval(() => {
      if (channelRef.current && connectionStatus === 'connected') {
        // 檢查頻道是否仍然活躍
        const channel = channelRef.current;
        if (!channel.state || channel.state === 'closed') {
          console.log('Detected closed channel, reconnecting...');
          cleanup();
          connect();
        }
      }
    }, 30000); // 每30秒檢查一次

    return () => {
      cleanup();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(healthCheckInterval);
    };
  }, [configs]);

  // 手動重連功能
  const reconnect = () => {
    retryCountRef.current = 0;
    cleanup();
    connect();
  };

  return {
    connectionStatus,
    reconnect,
    isConnected: connectionStatus === 'connected'
  };
}
