import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    const path = url.pathname.replace('/api', '')
    const method = req.method
    const apiKey = req.headers.get('x-api-key')

    // API Key validation (簡單驗證，你可以後續改進)
    if (!apiKey || apiKey !== Deno.env.get('API_ACCESS_KEY')) {
      return new Response(
        JSON.stringify({ error: '未授權：需要有效的API金鑰' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Route handling
    switch (true) {
      // 獲取問題列表
      case path === '/issues' && method === 'GET': {
        const { data: bugs, error } = await supabaseClient
          .from('bugs')
          .select(`
            id,
            title,
            description,
            priority,
            assigned_to,
            status_update as status,
            solution,
            created_at,
            updated_at,
            created_by
          `)
          .order('created_at', { ascending: false })

        if (error) throw error

        return new Response(
          JSON.stringify({ 
            success: true, 
            data: bugs,
            total: bugs?.length || 0
          }),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      // 獲取單個問題詳情
      case path.match(/^\/issues\/(.+)$/) && method === 'GET': {
        const issueId = path.match(/^\/issues\/(.+)$/)?.[1]
        
        const { data: bug, error } = await supabaseClient
          .from('bugs')
          .select(`
            id,
            title,
            description,
            priority,
            assigned_to,
            status_update as status,
            solution,
            created_at,
            updated_at,
            created_by,
            bug_attachments (
              id,
              file_name,
              file_path,
              file_type,
              file_size
            )
          `)
          .eq('id', issueId)
          .single()

        if (error) throw error

        return new Response(
          JSON.stringify({ 
            success: true, 
            data: bug
          }),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      // 獲取測試系統列表
      case path === '/test-systems' && method === 'GET': {
        const { data: systems, error } = await supabaseClient
          .from('test_systems')
          .select(`
            id,
            system_name,
            assigned_engineer,
            current_station,
            overall_progress,
            status,
            created_at,
            updated_at
          `)
          .order('created_at', { ascending: false })

        if (error) throw error

        return new Response(
          JSON.stringify({ 
            success: true, 
            data: systems,
            total: systems?.length || 0
          }),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      // 獲取測試進度
      case path === '/test-progress' && method === 'GET': {
        const systemId = url.searchParams.get('system_id')
        
        let query = supabaseClient
          .from('test_progress')
          .select(`
            id,
            system_id,
            station_id,
            item_id,
            status,
            progress_percent,
            notes,
            started_at,
            completed_at,
            test_systems!inner (
              system_name
            ),
            test_stations!inner (
              station_name
            ),
            test_items!inner (
              item_name,
              item_order
            )
          `)

        if (systemId) {
          query = query.eq('system_id', systemId)
        }

        const { data: progress, error } = await query
          .order('started_at', { ascending: false })

        if (error) throw error

        return new Response(
          JSON.stringify({ 
            success: true, 
            data: progress,
            total: progress?.length || 0
          }),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      // 獲取統計數據
      case path === '/stats' && method === 'GET': {
        const [bugsResult, systemsResult, progressResult] = await Promise.all([
          supabaseClient.from('bugs').select('id, status_update', { count: 'exact' }),
          supabaseClient.from('test_systems').select('id, status', { count: 'exact' }),
          supabaseClient.from('test_progress').select('id, status', { count: 'exact' })
        ])

        const stats = {
          issues: {
            total: bugsResult.count || 0,
            by_status: {}
          },
          test_systems: {
            total: systemsResult.count || 0,
            by_status: {}
          },
          test_progress: {
            total: progressResult.count || 0,
            by_status: {}
          }
        }

        // 計算狀態分布
        if (bugsResult.data) {
          bugsResult.data.forEach(bug => {
            const status = bug.status_update || '未知'
            stats.issues.by_status[status] = (stats.issues.by_status[status] || 0) + 1
          })
        }

        if (systemsResult.data) {
          systemsResult.data.forEach(system => {
            const status = system.status || '未知'
            stats.test_systems.by_status[status] = (stats.test_systems.by_status[status] || 0) + 1
          })
        }

        if (progressResult.data) {
          progressResult.data.forEach(progress => {
            const status = progress.status || '未知'
            stats.test_progress.by_status[status] = (stats.test_progress.by_status[status] || 0) + 1
          })
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            data: stats
          }),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      // API文檔端點
      case path === '/docs' && method === 'GET': {
        const docs = {
          title: "生產管理系統 API",
          version: "1.0.0",
          base_url: `${url.origin}/functions/v1/api`,
          authentication: {
            type: "API Key",
            header: "x-api-key",
            description: "請在請求頭中包含有效的API金鑰"
          },
          endpoints: [
            {
              path: "/issues",
              method: "GET",
              description: "獲取問題列表",
              response: "問題陣列"
            },
            {
              path: "/issues/{id}",
              method: "GET", 
              description: "獲取單個問題詳情",
              response: "問題物件，包含附件"
            },
            {
              path: "/test-systems",
              method: "GET",
              description: "獲取測試系統列表",
              response: "測試系統陣列"
            },
            {
              path: "/test-progress",
              method: "GET",
              description: "獲取測試進度",
              parameters: {
                system_id: "可選，篩選特定系統"
              },
              response: "測試進度陣列"
            },
            {
              path: "/stats",
              method: "GET",
              description: "獲取統計數據",
              response: "統計摘要物件"
            }
          ]
        }

        return new Response(
          JSON.stringify(docs, null, 2),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      default:
        return new Response(
          JSON.stringify({ 
            error: '找不到端點',
            available_endpoints: ['/issues', '/issues/{id}', '/test-systems', '/test-progress', '/stats', '/docs']
          }),
          { 
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
    }

  } catch (error) {
    console.error('API錯誤:', error)
    return new Response(
      JSON.stringify({ 
        error: '內部伺服器錯誤',
        message: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})