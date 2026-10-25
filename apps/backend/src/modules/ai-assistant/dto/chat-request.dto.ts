import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'model'], example: 'user' })
  @IsString()
  role!: 'user' | 'model';

  @ApiProperty({ example: 'How do I request medical leave?' })
  @IsString()
  text!: string;
}

export class ChatRequestDto {
  @ApiProperty({ example: 'What is the policy regarding sick leave and doctor prescriptions?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;

  @ApiPropertyOptional({ type: [ChatMessageDto] })
  @IsArray()
  @IsOptional()
  history?: ChatMessageDto[];
}
