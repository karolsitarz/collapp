import { prisma } from 'shared/utils/prismaClient'
import {
  createHandler,
  Get,
  NotFoundException,
  Param,
  ParseNumberPipe,
  Query,
} from '@storyofams/next-api-decorators'
import { NextAuthGuard } from 'shared/utils/apiDecorators'

@NextAuthGuard()
class Plugins {
  @Get()
  async getPluginsList(
    @Query('limit', ParseNumberPipe({ nullable: true })) limit?: number,
    @Query('name') name?: string,
  ) {
    const entityCount = await prisma.publishedPlugin.count({
      where: {
        ...(name && { name: { contains: name, mode: 'insensitive' } }),
      },
    })

    return {
      entities: await prisma.publishedPlugin.findMany({
        take: limit,
        where: {
          ...(name && { name: { contains: name, mode: 'insensitive' } }),
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      pagination: { entityCount, limit },
    }
  }

  @Get('/space/:id')
  async getPluginsInSpace(@Param('id') id: string) {
    return await prisma.spacePlugin.findMany({
      where: { spaceId: id },
      include: {
        plugin: {
          select: {
            name: true,
            icon: true,
            isDeleted: true,
            minWidth: true,
            maxWidth: true,
            minHeight: true,
            maxHeight: true,
          },
        },
      },
    })
  }

  @Get('/:id')
  async getPlugins(@Param('id') id: string) {
    const plugins = await prisma.publishedPlugin.findFirst({
      where: { id },
      include: {
        author: {
          select: {
            name: true,
          },
        },
      },
    })

    if (!plugins) {
      throw new NotFoundException('The plugin does not exist.')
    }

    return plugins
  }
}

export default createHandler(Plugins)
