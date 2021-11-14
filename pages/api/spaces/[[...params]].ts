import { prisma } from 'shared/utils/prismaClient'
import {
  Body,
  createHandler,
  Get,
  NotFoundException,
  Param,
  ParseNumberPipe,
  Patch,
  Post,
  Put,
  Query,
  UnauthorizedException,
  ValidationPipe,
} from '@storyofams/next-api-decorators'
import { NextAuthGuard, RequestUser, User } from 'shared/utils/apiDecorators'
import { IsNotEmpty, IsOptional, NotEquals } from 'class-validator'
import { fetchWithPagination } from 'shared/utils/fetchWithPagination'

export class CreateSpaceDTO {
  @IsNotEmpty({ message: 'Space name is required.' })
  name!: string
  description!: string
}

export class UpdateSpaceDTO {
  @IsOptional()
  @NotEquals('', { message: 'Space name is required.' })
  name?: string
  @IsOptional()
  description?: string
  @IsOptional()
  icon?: string
}

type UpdateSpacePluginsItem = {
  id: string
  left: number
  top: number
  height: number
  width: number
}
export class CreateInviteDTO {
  @IsNotEmpty({ message: 'Timeframe is required' })
  timeframe!: string
}

@NextAuthGuard()
class Spaces {
  @Get()
  getSpaceList(
    @User user: RequestUser,
    @Query('limit', ParseNumberPipe({ nullable: true })) limit?: number,
    @Query('page', ParseNumberPipe({ nullable: true })) page?: number,
  ) {
    return fetchWithPagination('space', limit, page, {
      users: {
        some: {
          userId: user.id,
        },
      },
    })
  }

  @Get('/:id')
  async getSpace(@Param('id') id: string, @User user: RequestUser) {
    const space = await prisma.space.findFirst({
      include: {
        plugins: {
          select: {
            pluginId: true,
            height: true,
            width: true,
            top: true,
            left: true,
          },
        },
      },
      where: {
        id,
        users: {
          some: {
            userId: user.id,
          },
        },
      },
    })

    if (!space) {
      throw new NotFoundException('The space does not exist.')
    }

    return space
  }

  @Post()
  createSpace(
    @Body(ValidationPipe) body: CreateSpaceDTO,
    @User user: RequestUser,
  ) {
    return prisma.space.create({
      data: {
        name: body.name,
        description: body.description,
        icon: '',
        users: {
          create: [
            {
              isOwner: true,
              canEdit: true,
              canInvite: true,
              user: {
                connect: {
                  id: user.id,
                },
              },
            },
          ],
        },
      },
    })
  }

  @Patch('/:id')
  async updateSpace(
    @Param('id') id: string,
    @Body(ValidationPipe) body: UpdateSpaceDTO,
    @User user: RequestUser,
  ) {
    const space = await prisma.space.findFirst({
      where: {
        id,
        users: {
          some: {
            userId: user.id,
          },
        },
      },
    })

    if (!space) {
      throw new NotFoundException('The space does not exist.')
    }

    return await prisma.space.update({
      where: { id },
      data: { ...body },
    })
  }

  @Put('/:id/plugins')
  async updatePlugins(
    @Param('id') id: string,
    @Body() body: UpdateSpacePluginsItem[],
    @User user: RequestUser,
  ) {
    const space = await prisma.space.findFirst({
      include: {
        plugins: true,
      },
      where: {
        id,
        users: {
          some: {
            userId: user.id,
          },
        },
      },
    })

    if (!space) {
      throw new NotFoundException('The space does not exist.')
    }

    const newPlugins = {} as { [key: string]: UpdateSpacePluginsItem }
    for (const item of body) {
      newPlugins[item.id] = item
    }
    const created = []
    const updated = []
    const deleted = []

    for (const plugin of space.plugins) {
      const newPlugin = newPlugins?.[plugin.pluginId]
      // delete case
      if (!newPlugin) {
        deleted.push({ pluginId: plugin.pluginId })
        continue
      }
      // modify case
      if (
        newPlugin.left !== plugin.left ||
        newPlugin.top !== plugin.top ||
        newPlugin.width !== plugin.width ||
        newPlugin.height !== plugin.height
      ) {
        updated.push({
          where: { pluginId: plugin.pluginId },
          data: {
            left: newPlugin.left,
            top: newPlugin.top,
            width: newPlugin.width,
            height: newPlugin.height,
          },
        })
      }
      delete newPlugins[plugin.pluginId]
    }

    for (const key in newPlugins) {
      const { id, left, top, width, height } = newPlugins[key]

      created.push({ pluginId: id, left, top, width, height })
    }

    return await prisma.space.update({
      where: { id },
      data: {
        plugins: {
          deleteMany: deleted,
          create: created,
          updateMany: updated,
        },
      },
    })
  }

  @Post('/:id/invite')
  async generateInvite(
    @Param('id') id: string,
    @Body(ValidationPipe) body: CreateInviteDTO,
    @User user: RequestUser,
  ) {
    const space = await prisma.space.findFirst({
      where: {
        id,
      },
    })

    if (!space) {
      throw new NotFoundException('The space does not exist.')
    }

    const spaceUser = await prisma.spaceUser.findFirst({
      where: {
        spaceId: id,
        userId: user.id,
      },
    })

    if (!spaceUser) {
      throw new UnauthorizedException(
        'Users outside the space cannot generate invitations.',
      )
    }
    if (!spaceUser.canInvite) {
      throw new UnauthorizedException(
        'Only users with invite permisions can generate invitations.',
      )
    }

    let expire: number | null = 0
    switch (body.timeframe) {
      case '1':
        expire = 1
        break
      case '3':
        expire = 3
        break
      case '7':
        expire = 7
        break
      default:
        expire = null
    }

    const today = new Date()
    let expireDay = null
    if (!!expire) {
      expireDay = new Date()
      expireDay.setDate(today.getDate() + expire)
    }

    const invite = await prisma.invite.create({
      data: {
        expiresAt: expireDay,
        space: {
          connect: {
            id: id,
          },
        },
      },
    })

    return invite
  }
}

export default createHandler(Spaces)