import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/components/auth/UserContext';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MentionUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string, mentions: MentionUser[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function MentionInput({ 
  value, 
  onChange, 
  placeholder = "輸入 @ 來標註用戶...", 
  className,
  disabled 
}: MentionInputProps) {
  const { user } = useUser();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 獲取用戶列表
  const fetchUsers = useCallback(async (query: string) => {
    try {
      const { data, error } = await supabase
        .from('system_users')
        .select('id, username, display_name, role')
        .ilike('username', `%${query}%`)
        .eq('status', 'active')
        .limit(10);

      if (error) throw error;

      const users: MentionUser[] = data.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name || u.username,
        role: u.role
      }));

      setSuggestions(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      setSuggestions([]);
    }
  }, []);

  // 處理輸入變化
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursor = e.target.selectionStart;
    setCursorPosition(cursor);

    // 檢查是否在輸入標註
    const textBeforeCursor = newValue.substring(0, cursor);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1];
      setMentionQuery(query);
      setShowSuggestions(true);
      setSelectedIndex(0);
      fetchUsers(query);
    } else {
      setShowSuggestions(false);
      setMentionQuery('');
    }

    // 解析已存在的標註
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const foundMentions: MentionUser[] = [];
    let match;

    while ((match = mentionRegex.exec(newValue)) !== null) {
      const [, displayName, userId] = match;
      const existingMention = mentions.find(m => m.id === userId);
      if (existingMention) {
        foundMentions.push(existingMention);
      }
    }

    setMentions(foundMentions);
    onChange(newValue, foundMentions);
  }, [fetchUsers, mentions, onChange]);

  // 選擇標註用戶
  const selectMention = useCallback((selectedUser: MentionUser) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const textAfterCursor = value.substring(cursorPosition);
    
    // 找到 @ 的位置
    const mentionStart = textBeforeCursor.lastIndexOf('@');
    const textBeforeMention = textBeforeCursor.substring(0, mentionStart);
    
    // 構建標註文本 @[顯示名稱](用戶ID)
    const mentionText = `@[${selectedUser.displayName}](${selectedUser.id})`;
    const newValue = textBeforeMention + mentionText + ' ' + textAfterCursor;
    
    // 更新狀態
    const newMentions = [...mentions];
    if (!newMentions.find(m => m.id === selectedUser.id)) {
      newMentions.push(selectedUser);
    }
    
    setMentions(newMentions);
    setShowSuggestions(false);
    setMentionQuery('');
    
    // 設置新的光標位置
    const newCursorPos = textBeforeMention.length + mentionText.length + 1;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
    
    onChange(newValue, newMentions);
  }, [value, cursorPosition, mentions, onChange]);

  // 處理鍵盤事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          selectMention(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  }, [showSuggestions, suggestions, selectedIndex, selectMention]);

  // 渲染建議列表
  const renderSuggestions = () => {
    if (!showSuggestions || suggestions.length === 0) return null;

    return (
      <Card className="absolute z-50 mt-1 max-h-60 w-full overflow-auto p-1">
        {suggestions.map((suggestion, index) => (
          <div
            key={suggestion.id}
            className={cn(
              "flex items-center gap-3 rounded-md p-2 cursor-pointer transition-colors",
              index === selectedIndex 
                ? "bg-accent text-accent-foreground" 
                : "hover:bg-accent/50"
            )}
            onClick={() => selectMention(suggestion)}
          >
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">
                {suggestion.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{suggestion.displayName}</div>
              <div className="text-xs text-muted-foreground">@{suggestion.username}</div>
            </div>
            <div className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
              {suggestion.role}
            </div>
          </div>
        ))}
      </Card>
    );
  };

  return (
    <div className={cn("relative", className)}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[100px] resize-none"
      />
      {renderSuggestions()}
    </div>
  );
}