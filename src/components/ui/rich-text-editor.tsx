import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered, 
  Link2,
  Upload,
  ExternalLink,
  Undo,
  Redo,
  RemoveFormatting,
  Palette
} from 'lucide-react';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import DOMPurify from 'dompurify';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  disableImageResize?: boolean;
  disableImageUpload?: boolean;
  onImageUpload?: (file: File) => Promise<string>;
}

export function RichTextEditor({ content, onChange, placeholder = "開始編輯...", className, disableImageResize = false, disableImageUpload = false, onImageUpload }: RichTextEditorProps) {
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isImageUrlModalOpen, setIsImageUrlModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: `max-w-full h-auto rounded-lg cursor-pointer ${disableImageResize ? '' : 'resizable-image'}`,
          style: disableImageResize ? '' : 'resize: both; overflow: auto; border: 2px dashed transparent; min-width: 50px; min-height: 50px;',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
      TextStyle,
      Color,
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const sanitizedHtml = DOMPurify.sanitize(html);
      onChange?.(sanitizedHtml);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none p-4 min-h-[200px]',
      },
    },
  });

  const insertImage = useCallback((url: string) => {
    if (editor && url) {
      editor.chain().focus().setImage({ 
        src: url
      }).run();
    }
  }, [editor]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && editor) {
      try {
        if (onImageUpload) {
          const uploadedUrl = await onImageUpload(file);
          if (uploadedUrl) {
            insertImage(uploadedUrl);
          }
        } else {
          const reader = new FileReader();
          reader.onload = (e) => {
            const url = e.target?.result as string;
            if (url) {
              insertImage(url);
            }
          };
          reader.readAsDataURL(file);
        }
      } catch (err) {
        console.error('Image upload failed:', err);
      }
    }
  }, [editor, onImageUpload, insertImage]);

  const handleImageUrlSubmit = () => {
    if (imageUrl.trim()) {
      insertImage(imageUrl);
      setImageUrl('');
      setIsImageUrlModalOpen(false);
    }
  };

  const handleLinkSubmit = () => {
    if (linkUrl.trim() && linkText.trim() && editor) {
      editor.chain().focus().insertContent(
        `<a href="${linkUrl}" class="text-primary underline cursor-pointer">${linkText}</a>`
      ).run();
      setLinkUrl('');
      setLinkText('');
      setIsLinkModalOpen(false);
    }
  };

  const handleImageClick = (src: string) => {
    setLightboxImage(src);
    setLightboxOpen(true);
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="border rounded-lg">
      {/* Toolbar */}
      <div className="border-b p-2 flex flex-wrap gap-1">
        {/* Headings */}
        <select
          className="px-2 py-1 border rounded text-sm bg-background"
          value={
            editor.isActive('heading', { level: 1 }) ? 'h1' :
            editor.isActive('heading', { level: 2 }) ? 'h2' :
            editor.isActive('heading', { level: 3 }) ? 'h3' :
            'p'
          }
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'p') {
              editor.chain().focus().setParagraph().run();
            } else {
              const level = parseInt(value.replace('h', '')) as 1 | 2 | 3;
              editor.chain().focus().toggleHeading({ level }).run();
            }
          }}
        >
          <option value="p">段落</option>
          <option value="h1">標題1</option>
          <option value="h2">標題2</option>
          <option value="h3">標題3</option>
        </select>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Text Formatting */}
        <Button
          variant={editor.isActive('bold') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </Button>

        <Button
          variant={editor.isActive('italic') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </Button>

        <Button
          variant={editor.isActive('underline') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Lists */}
        <Button
          variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </Button>

        <Button
          variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Link */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsLinkModalOpen(true)}
        >
          <Link2 className="h-4 w-4" />
        </Button>

        {/* Image Upload & URL */}
        {!disableImageUpload && (
          <>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleFileUpload}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              title="上傳圖片"
            >
              <Upload className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsImageUrlModalOpen(true)}
              title="插入圖片 URL"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </>
        )}

        <div className="w-px h-6 bg-border mx-1" />

        {/* Text Color */}
        <div className="flex items-center gap-1">
          <input
            type="color"
            value={selectedColor}
            onChange={(e) => {
              setSelectedColor(e.target.value);
              editor.chain().focus().setColor(e.target.value).run();
            }}
            className="w-8 h-6 rounded border cursor-pointer"
            title="文字顏色"
          />
          <Palette className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Undo/Redo */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo className="h-4 w-4" />
        </Button>

        {/* Clear Formatting */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
        >
          <RemoveFormatting className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor Content */}
      <EditorContent 
        editor={editor} 
        className={cn("min-h-[200px]", className)}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'IMG') {
            e.preventDefault();
            e.stopPropagation();
            const src = target.getAttribute('src');
            if (src) {
              // 簡單的切換邏輯：如果已經開啟且是同一張圖片就關閉，否則開啟
              if (lightboxOpen && lightboxImage === src) {
                setLightboxOpen(false);
                setLightboxImage('');
              } else {
                setLightboxImage(src);
                setLightboxOpen(true);
              }
            }
          }
        }}
      />

      {/* Custom CSS for proper heading sizes and image resizing */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .ProseMirror h1 { 
          font-size: 2em !important; 
          font-weight: bold !important; 
          margin: 0.67em 0 !important; 
          line-height: 1.2 !important;
        }
        .ProseMirror h2 { 
          font-size: 1.5em !important; 
          font-weight: bold !important; 
          margin: 0.75em 0 !important; 
          line-height: 1.3 !important;
        }
        .ProseMirror h3 { 
          font-size: 1.17em !important; 
          font-weight: bold !important; 
          margin: 0.83em 0 !important; 
          line-height: 1.4 !important;
        }
        .ProseMirror h4 { 
          font-size: 1em !important; 
          font-weight: bold !important; 
          margin: 1em 0 !important; 
        }
        .ProseMirror h5 { 
          font-size: 0.83em !important; 
          font-weight: bold !important; 
          margin: 1.17em 0 !important; 
        }
        .ProseMirror h6 { 
          font-size: 0.67em !important; 
          font-weight: bold !important; 
          margin: 1.33em 0 !important; 
        }
        .ProseMirror img {
          ${disableImageResize ? 'resize: none !important;' : 'resize: both !important;'}
          overflow: hidden !important;
          border: ${disableImageResize ? 'none !important;' : '2px dashed transparent !important;'}
          min-width: ${disableImageResize ? 'auto !important;' : '50px !important;'}
          min-height: ${disableImageResize ? 'auto !important;' : '50px !important;'}
          max-width: 100% !important;
          cursor: ${disableImageResize ? 'pointer !important;' : 'nw-resize !important;'}
          position: relative !important;
        }
        .ProseMirror img:hover {
          border-color: ${disableImageResize ? 'transparent !important;' : 'hsl(217 91% 60%) !important;'}
        }
        .ProseMirror img.ProseMirror-selectednode {
          border-color: ${disableImageResize ? 'transparent !important;' : 'hsl(142 76% 36%) !important;'}
          resize: ${disableImageResize ? 'none !important;' : 'both !important;'}
        }
        .ProseMirror img:not(.ProseMirror-selectednode) {
          cursor: pointer !important;
        }
        .ProseMirror p { margin: 0.5em 0; }
        .ProseMirror ul, .ProseMirror ol { margin: 0.5em 0; padding-left: 1.5em; }
        `
      }} />

      {/* Link Modal */}
      <Dialog open={isLinkModalOpen} onOpenChange={setIsLinkModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>插入連結</DialogTitle>
            <DialogDescription>
              請輸入連結文字和網址
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">連結文字</label>
              <Input
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="輸入連結文字"
              />
            </div>
            <div>
              <label className="text-sm font-medium">連結網址</label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsLinkModalOpen(false);
                setLinkUrl('');
                setLinkText('');
              }}
            >
              取消
            </Button>
            <Button onClick={handleLinkSubmit}>
              插入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image URL Modal */}
      <Dialog open={isImageUrlModalOpen} onOpenChange={setIsImageUrlModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>插入圖片 URL</DialogTitle>
            <DialogDescription>
              請輸入圖片的網址
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">圖片網址</label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsImageUrlModalOpen(false);
                setImageUrl('');
              }}
            >
              取消
            </Button>
            <Button onClick={handleImageUrlSubmit}>
              插入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox for image viewing */}
      <Lightbox
        open={lightboxOpen}
        close={() => {
          setLightboxOpen(false);
          setLightboxImage('');
        }}
        slides={lightboxImage ? [{ src: lightboxImage }] : []}
        render={{
          buttonPrev: () => null,
          buttonNext: () => null,
        }}
        carousel={{
          finite: true,
        }}
        controller={{
          closeOnBackdropClick: true,
          closeOnPullDown: true,
          closeOnPullUp: true
        }}
      />
      
      {/* Custom close button overlay */}
      {lightboxOpen && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10001,
            background: 'rgba(0, 0, 0, 0.8)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'white',
            fontSize: '24px',
            fontWeight: 'bold'
          }}
          onClick={() => {
            setLightboxOpen(false);
            setLightboxImage('');
          }}
        >
          ×
        </div>
      )}
    </div>
  );
}