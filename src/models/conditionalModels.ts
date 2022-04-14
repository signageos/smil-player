import { ComparatorChar, ConditionalExprFunction } from '../enums/conditionalEnums';

export type ComparableExpr = {
	comparator?: ComparatorChar;
	compareValue?: string;
};

export interface FuncExpr extends ComparableExpr {
	func: ConditionalExprFunction;
	args: string[];
}

export interface ConstExpr extends ComparableExpr {
	constValue: string;
}

export type ParsedExpr = FuncExpr | ConstExpr;
