import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";

interface LoginDto {
  email: string;
  password: string;
}

interface RegisterDto extends LoginDto {
  nickname: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}

