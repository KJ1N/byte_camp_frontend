import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";

interface RegisterInput {
  email: string;
  password: string;
  nickname: string;
}

interface LoginInput {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterInput) {
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        nickname: input.nickname,
        passwordHash,
      },
      select: { id: true, email: true, nickname: true },
    });

    return this.issueToken(user);
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new UnauthorizedException("Invalid email or password");

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid email or password");

    return this.issueToken({ id: user.id, email: user.email, nickname: user.nickname });
  }

  private async issueToken(user: { id: string; email: string; nickname: string }) {
    const expiresIn = (this.config.get<string>("JWT_EXPIRES_IN") ?? "7d") as JwtSignOptions["expiresIn"];

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
        expiresIn,
      },
    );

    return { accessToken, user };
  }
}
