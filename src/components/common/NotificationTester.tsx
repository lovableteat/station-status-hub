
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMentionNotifications } from '@/hooks/useMentionNotifications';
import { useUser } from '@/components/auth/UserContext';

export function NotificationTester() {
  const { user } = useUser();
  const { sendMentionNotifications, isLoading } = useMentionNotifications();
  const [testMessage, setTestMessage] = useState('測試標註 @[Andy](5d2f4e0a-4dfb-445e-9efd-aaddfb265dcd)');
  const [testTitle, setTestTitle] = useState('測試通知標題');

  const handleSendTest = async () => {
    if (!user) {
      alert('請先登入');
      return;
    }

    await sendMentionNotifications(testMessage, {
      title: testTitle,
      message: testMessage,
      referenceType: 'test',
      referenceId: crypto.randomUUID(),
      metadata: {
        testType: 'manual_test',
        sender_name: user.displayName
      }
    });
  };

  if (!user) {
    return null;
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>通知測試工具</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">通知標題</label>
          <Input
            value={testTitle}
            onChange={(e) => setTestTitle(e.target.value)}
            placeholder="輸入通知標題"
          />
        </div>
        <div>
          <label className="text-sm font-medium">測試訊息 (包含標註)</label>
          <Textarea
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            placeholder="輸入包含 @[用戶名](用戶ID) 的訊息"
            className="min-h-[100px]"
          />
        </div>
        <Button 
          onClick={handleSendTest} 
          disabled={isLoading || !testMessage.trim()}
          className="w-full"
        >
          {isLoading ? '發送中...' : '發送測試通知'}
        </Button>
        <div className="text-xs text-muted-foreground">
          <p>當前用戶: {user.displayName} ({user.userId})</p>
          <p>標註格式: @[顯示名稱](用戶ID)</p>
        </div>
      </CardContent>
    </Card>
  );
}
