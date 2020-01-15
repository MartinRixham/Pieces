define(["./Library"], function() {

	function CompoundWord() {

		var words = [];

		var index;

		this.get = function() {

			return words[index];
		};

		this.set = function(word, routeIndex, callback) {

			words[index].set(word, routeIndex, callback);
		};

		this.push = function(word) {

			words.push(word);
		};

		this.setIndex = function(i) {

			index = i;
		};
	}

	return CompoundWord;
});
