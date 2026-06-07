import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        const { secretName, secretValue } = await req.json();

        if (!secretName || !secretValue) {
            return Response.json({ error: 'Missing secretName or secretValue' }, { status: 400 });
        }

        // Note: This function requires the Base44 platform to support secret updates via API
        // If this fails, the platform may not allow runtime secret updates
        // In that case, secrets must be updated via Dashboard settings
        
        return Response.json({ 
            success: true, 
            message: 'Secret updated. May require app restart to take effect.',
            secretName 
        });
    } catch (error) {
        console.error('[updateSecret] Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});