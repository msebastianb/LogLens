/**
 * Fastify auth plugin — JWT verification + request.user decoration.
 *
 * Exposes `fastify.authenticate` — a preHandler hook that:
 *   1. Verifies the `token` httpOnly cookie via fastify.jwt.verify()
 *   2. On success: decorates request.user = { id, username }
 *   3. On failure: throws 401 Unauthorized
 *
 * Must be wrapped with fastify-plugin (fp) so the decorator is available
 * in the parent scope (not scoped to a sub-plugin registration).
 *
 * [Source: architecture.md#authentication-security, story-1.4]
 */
import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

// Extend @fastify/jwt so request.user is typed as our payload shape
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { id: number; username: string }
  }
}

// Extend Fastify type system for fastify.authenticate
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const payload = await req.jwtVerify<{ sub: string; username: string }>()
        req.user = { id: Number(payload.sub), username: payload.username }
      } catch {
        return reply.unauthorized('Authentication required')
      }
    },
  )
}

export default fp(authPlugin, { name: 'auth' })
