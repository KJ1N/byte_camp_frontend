"use client";

import { useRouter } from "next/navigation";

const coreValues = [
  {
    title: "国家层面",
    values: "富强、民主、文明、和谐",
    description: "选题应关注真实发展、公共生活与社会进步，避免制造对立、煽动情绪或传播片面结论。",
  },
  {
    title: "社会层面",
    values: "自由、平等、公正、法治",
    description: "表达应尊重事实、规则和不同群体的合法权益，不以偏见、歧视或未经证实的信息引导读者。",
  },
  {
    title: "个人层面",
    values: "爱国、敬业、诚信、友善",
    description: "创作应坚持诚实署名、清晰标注来源，鼓励理性讨论和友善互动。",
  },
];

const publishRules = [
  "坚持真实、客观、建设性的表达，不发布虚假信息、夸大事实或断章取义内容。",
  "不得发布违法违规、低俗色情、赌博毒品、暴力犯罪、诈骗引流等高风险内容。",
  "不得泄露他人手机号、身份证号、住址、聊天记录等敏感个人信息。",
  "涉及医疗、金融、教育、法律等高影响领域时，应标注可靠来源，避免绝对化承诺。",
  "尊重原创与版权，引用资料、图片、数据或观点时应说明出处，不冒用他人身份或作品。",
  "使用 AI 生成内容时，作者仍需人工核验事实、语气、风险片段和读者理解成本。",
];

const prePublishChecklist = ["标题是否准确", "事实是否可核验", "观点是否理性", "引用是否标注", "图片是否合规", "是否通过审核"];

export default function DocsPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-20 border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5">
          <button
            aria-label="返回上一页"
            className="rounded-md bg-[#f6f7f9] px-3 py-2 text-sm font-semibold text-[#4e5661] hover:bg-[#eeeeee] hover:text-[#ff4d4f] focus:outline-none focus:ring-2 focus:ring-[#ffb6b7]"
            type="button"
            onClick={() => router.back()}
          >
            返回
          </button>
          <div className="brand-wordmark text-lg">文舟</div>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <section className="border-b border-[#e5e7eb] pb-7">
          <p className="text-sm font-semibold text-[#ff4d4f]">发布前必读</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[#1f2329]">发文规范</h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-[#5d6673]">
            平台鼓励真实、有价值、负责任的内容创作。所有待发布内容都应符合社会主义核心价值观，遵守法律法规和平台内容安全要求，并在发布前完成事实核验、版权确认和风险自查。
          </p>
        </section>

        <section className="py-7">
          <h2 className="text-lg font-semibold text-[#1f2329]">核心价值导向</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {coreValues.map((item) => (
              <article className="rounded-md border border-[#e5e7eb] bg-white p-5" key={item.title}>
                <div className="text-sm font-semibold text-[#8f959e]">{item.title}</div>
                <h3 className="mt-2 text-xl font-semibold text-[#ff4d4f]">{item.values}</h3>
                <p className="mt-3 text-sm leading-7 text-[#5d6673]">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 py-2 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-md border border-[#e5e7eb] bg-white p-5">
            <h2 className="text-lg font-semibold text-[#1f2329]">内容发布要求</h2>
            <ul className="mt-4 grid gap-3 text-sm leading-7 text-[#4e5661]">
              {publishRules.map((rule) => (
                <li className="flex gap-3" key={rule}>
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff4d4f]" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          <aside className="rounded-md border border-[#e5e7eb] bg-white p-5">
            <h2 className="text-lg font-semibold text-[#1f2329]">发布前检查</h2>
            <div className="mt-4 grid gap-2">
              {prePublishChecklist.map((item) => (
                <div
                  className="flex items-center justify-between rounded-md bg-[#f8f9fb] px-3 py-2 text-sm text-[#4e5661]"
                  key={item}
                >
                  <span>{item}</span>
                  <span className="text-[#ff4d4f]">必查</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-6 text-[#8f959e]">
              若内容涉及争议事实、敏感人物、重大公共事件或专业建议，请优先补充来源并降低绝对化表达。
            </p>
          </aside>
        </section>
      </div>
    </main>
  );
}
