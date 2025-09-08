import React, { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

export class TestTrackerErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('TestTracker Error Boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
    
    // 清理可能的內存洩漏
    try {
      // 清理localStorage中可能損壞的數據
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.includes('test-tracker') || key.includes('testtracker')) {
          try {
            JSON.parse(localStorage.getItem(key) || '');
          } catch {
            localStorage.removeItem(key);
            console.warn(`Removed corrupted localStorage key: ${key}`);
          }
        }
      });
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleGoHome = () => {
    // Dispatch navigation event
    window.dispatchEvent(new CustomEvent('navigate', { 
      detail: { module: 'dashboard' } 
    }));
    this.handleReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {this.props.fallbackTitle || '測試追蹤系統錯誤'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                測試追蹤系統遇到問題無法正常運行。這可能是由於數據損壞或內存不足造成的。
              </p>
              
              <div className="bg-muted p-3 rounded text-sm">
                <p className="font-medium text-destructive mb-2">可能的解決方案：</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>重新載入組件</li>
                  <li>返回主頁面重新進入</li>
                  <li>清理瀏覽器快取</li>
                  <li>重新整理頁面</li>
                </ul>
              </div>
              
              {this.state.error && (
                <details className="bg-muted p-3 rounded text-sm">
                  <summary className="cursor-pointer font-medium">錯誤詳情</summary>
                  <pre className="mt-2 text-xs overflow-auto max-h-32">
                    {this.state.error.message}
                    {this.state.errorInfo?.componentStack && (
                      '\n\nComponent Stack:' + this.state.errorInfo.componentStack
                    )}
                  </pre>
                </details>
              )}
              
              <div className="flex gap-2">
                <Button onClick={this.handleReset} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  重新載入組件
                </Button>
                <Button onClick={this.handleGoHome} variant="outline">
                  <Home className="h-4 w-4 mr-2" />
                  返回主頁
                </Button>
                <Button onClick={() => window.location.reload()} variant="default">
                  重新整理頁面
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}