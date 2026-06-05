import { BadGatewayException, GatewayTimeoutException, ServiceUnavailableException } from "@nestjs/common";

export interface AiProviderErrorDetail {
  providerStatus?: number;
  providerCode?: string;
  providerMessage?: string;
}

export class AiProviderConfigurationException extends ServiceUnavailableException {
  constructor() {
    super("AI 配置缺失，请检查后端环境变量。");
  }
}

export class AiProviderBadOutputException extends BadGatewayException {
  constructor(message = "模型输出解析失败，请稍后重试。") {
    super(message);
  }
}

export class AiProviderUnavailableException extends BadGatewayException {
  constructor(detail: AiProviderErrorDetail = {}) {
    super({
      message: "模型服务暂时不可用，请稍后重试。",
      ...detail,
    });
  }
}

export class AiProviderTimeoutException extends GatewayTimeoutException {
  constructor() {
    super("模型请求超时，请稍后重试。");
  }
}
